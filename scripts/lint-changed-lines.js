#!/usr/bin/env node
// Usage:
// BASE=origin/main node scripts/lint-changed-lines.js
// or set BASE env in CI to the PR base branch

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE || "origin/main";
const EXT_GLOB = ["js", "jsx", "ts", "tsx", "svelte"]; // Include svelte files

function run(cmd) {
    try {
        return execSync(cmd, { encoding: "utf8" });
    } catch (e) {
        return e.stdout || "";
    }
}

// 1) Get list of changed target files (extension filter)
const nameCmd = `git diff --name-only ${BASE}...HEAD -- ${EXT_GLOB.map(e => "*." + e).join(" ")}`;
const filesRaw = run(nameCmd).trim().split(/\r?\n/).filter(Boolean);
if (filesRaw.length === 0) {
    console.log("No changed JS/TS/Svelte files.");
    process.exit(0);
}
const files = filesRaw.filter(f => fs.existsSync(f));
if (files.length === 0) {
    console.log("No existing files matched (maybe deleted).");
    process.exit(0);
}

// 2) Extract added/changed line ranges (+ side) for each file
// map: filepath -> [{start, end}, ...]
const fileRanges = {};
for (const file of files) {
    // --unified=0 gets line ranges clearly without hunk context
    const diff = run(`git diff --unified=0 ${BASE}...HEAD -- ${file}`);
    const ranges = [];
    const hunkRe = /\@\@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? \@\@/g;
    let m;
    while ((m = hunkRe.exec(diff)) !== null) {
        const start = parseInt(m[1], 10);
        const count = m[2] ? parseInt(m[2], 10) : 1;
        const end = start + Math.max(count - 1, 0);
        ranges.push({ start, end });
    }
    if (ranges.length) fileRanges[file] = ranges;
}

// Nothing to check?
if (Object.keys(fileRanges).length === 0) {
    console.log("No changed hunks found to lint.");
    process.exit(0);
}

// 3) Run ESLint on changed files (JSON output)
const eslintCmd = `npx eslint -f json ${Object.keys(fileRanges).map(f => `"${f}"`).join(" ")} --cache`;
let eslintOut;
try {
    eslintOut = run(eslintCmd);
} catch (e) {
    // eslint returns non-zero on errors — we still want its JSON
    eslintOut = e.stdout || e.stdout === undefined ? e.stdout : "";
}
if (!eslintOut) {
    console.log("No eslint output (maybe no issues).");
    process.exit(0);
}

let results;
try {
    results = JSON.parse(eslintOut);
} catch (e) {
    console.error("Failed to parse ESLint JSON output", e);
    console.log(eslintOut);
    process.exit(2);
}

// 4) Filter ESLint messages against changed lines
function inRanges(line, ranges) {
    for (const r of ranges) if (line >= r.start && line <= r.end) return true;
    return false;
}

const filtered = [];
for (const fileRes of results) {
    const relPath = path.relative(process.cwd(), fileRes.filePath);
    const ranges = fileRanges[relPath] || fileRanges[fileRes.filePath];
    if (!ranges) continue;
    const messagesInDiff = fileRes.messages.filter(msg => inRanges(msg.line, ranges));
    if (messagesInDiff.length) {
        filtered.push({
            filePath: fileRes.filePath,
            messages: messagesInDiff,
        });
    }
}

// 5) Output (human-readable) and exit code
if (filtered.length === 0) {
    console.log("No lint issues in changed lines. ✅");
    process.exit(0);
}

// pretty print
for (const f of filtered) {
    console.log(`\n${f.filePath}`);
    for (const m of f.messages) {
        console.log(`  ${m.line}:${m.column} ${m.severity === 2 ? "error" : "warn"} ${m.ruleId} — ${m.message}`);
    }
}
console.log("\nESLint found issues in changed lines. Fix required.");
process.exit(1);
