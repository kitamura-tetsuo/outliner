#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { compareTestCaseSnapshots } from "../e2e/utils/snapshotComparison.js";

function extractBaseTestName(fullName) {
    const idx = fullName.lastIndexOf("-auto-");
    if (idx !== -1) return fullName.substring(0, idx);
    return fullName.replace(/-\d{13,}$/g, "");
}

function parseArgs(argv) {
    const args = { filter: null, file: null, fluidFile: null, fluidDir: null };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--filter" && i + 1 < argv.length) {
            args.filter = String(argv[++i]);
        } else if (a === "--file" && i + 1 < argv.length) {
            const p = String(argv[++i]);
            const base = path.basename(p).replace(/\.(spec|test)\.(t|j)sx?$/i, "");
            args.filter = base.toLowerCase();
            args.file = p;
        } else if (a === "--fluid" && i + 1 < argv.length) {
            args.fluidFile = String(argv[++i]);
        } else if (a === "--fluid-dir" && i + 1 < argv.length) {
            args.fluidDir = String(argv[++i]);
        } else if (a === "-h" || a === "--help") {
            console.log(
                `Usage: node scripts/compareSnapshots.js [--filter <substring>] [--file <spec path>] [--fluid <file>] [--fluid-dir <dir>]`,
            );
            process.exit(0);
        } else {
            // ignore unknowns for forward-compat
        }
    }
    return args;
}

function main() {
    const { filter, fluidFile, fluidDir } = parseArgs(process.argv);
    const cwd = process.cwd();
    const snapshotsDir = path.join(cwd, "e2e-snapshots");
    if (!fs.existsSync(snapshotsDir)) {
        console.error("❌ Snapshots directory not found:", snapshotsDir);
        process.exit(1);
    }

    const files = fs.readdirSync(snapshotsDir);
    const fluid = new Map();
    const yjs = new Map();

    for (const f of files) {
        if (f.endsWith("-fluid.json")) {
            const base = extractBaseTestName(f.replace(/-fluid.json$/, ""));
            fluid.set(base, f);
        } else if (f.endsWith("-yjs.json")) {
            const base = extractBaseTestName(f.replace(/-yjs.json$/, ""));
            yjs.set(base, f);
        }
    }

    // Load external fluid snapshots if requested or if default directory exists
    let extraFluidDir = fluidDir || process.env.FLUID_SNAP_DIR;
    if (!extraFluidDir) {
        const defaultDir = "/home/ubuntu/src2/outliner-fluid/client/e2e-snapshots";
        if (fs.existsSync(defaultDir)) extraFluidDir = defaultDir;
    }
    const externalFluidFiles = [];
    if (extraFluidDir && fs.existsSync(extraFluidDir)) {
        try {
            for (const f of fs.readdirSync(extraFluidDir)) {
                if (f.endsWith("-fluid.json")) externalFluidFiles.push(path.join(extraFluidDir, f));
            }
        } catch {}
    }

    // Build yjs list with optional filter
    const yjsList = [];
    for (const [base, fname] of yjs.entries()) {
        const b = base.toLowerCase();
        if (filter && !b.includes(filter.toLowerCase())) continue;
        yjsList.push({ base, path: path.join(snapshotsDir, fname) });
    }

    // Determine fluid candidates and pairing strategy
    const fluidPairs = new Map(fluid); // name -> filename in local dir
    const localFluidPaths = new Map();
    for (const [b, fname] of fluidPairs.entries()) {
        localFluidPaths.set(b, path.join(snapshotsDir, fname));
    }

    function pickNewestFluidPath() {
        const all = [
            ...[...localFluidPaths.values()],
            ...externalFluidFiles,
        ].filter(p => {
            try {
                return fs.existsSync(p);
            } catch {
                return false;
            }
        });
        if (all.length === 0) return null;
        all.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        return all[0];
    }

    const explicitFluidPath = fluidFile
        ? (path.isAbsolute(fluidFile) ? fluidFile : path.join(snapshotsDir, fluidFile))
        : null;

    const pairs = [];
    // First try base-name pairs; otherwise fallback to a single fluid baseline
    for (const y of yjsList) {
        let fpath = localFluidPaths.get(y.base);
        if (!fpath) {
            if (explicitFluidPath && fs.existsSync(explicitFluidPath)) {
                fpath = explicitFluidPath;
            } else {
                fpath = pickNewestFluidPath();
            }
        }
        if (fpath) pairs.push({ base: y.base, fluidPath: fpath, yjsPath: y.path });
    }

    console.log(
        `🔍 Found ${pairs.length} test case(s) to compare${filter ? ` (filter: ${filter})` : ""}${
            explicitFluidPath ? `, fluid: ${path.basename(explicitFluidPath)}` : ""
        }:`,
    );
    for (const p of pairs) console.log(`  - ${p.base}`);
    console.log("");

    let total = 0;
    let passed = 0;
    for (const p of pairs) {
        console.log(`🔍 Comparing: ${p.base}`);
        console.log(`  Fluid: ${path.basename(p.fluidPath)}`);
        console.log(`  Yjs:   ${path.basename(p.yjsPath)}`);
        total++;
        const res = compareTestCaseSnapshots(p.fluidPath, p.yjsPath);
        if (res.success) {
            console.log(`[${p.base}] ✅ Snapshots match perfectly!`);
            passed++;
        } else {
            console.log(`[${p.base}] ❌ Snapshots differ:`);
            for (const [i, d] of (res.differences ?? []).entries()) {
                console.log(`  ${i + 1}. ${d}`);
            }
        }
        console.log("");
    }

    console.log("=".repeat(50));
    console.log("📊 Comparison Summary:");
    console.log(`  Total test cases: ${total}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${total - passed}`);
    console.log(`  Success rate: ${total > 0 ? Math.round((passed / total) * 100) : 0}%`);

    process.exit(total > 0 && passed === total ? 0 : 1);
}

main();
