#!/usr/bin/env node

/**
 * Script to generate E2E test coverage report
 *
 * Usage:
 *   node scripts/generate-e2e-coverage.js
 *
 * Prerequisites:
 *   - E2E tests must be executed with COVERAGE=true
 *   - Coverage data must exist in coverage/e2e/raw/
 */

import fs from "fs";
import { CoverageReport } from "monocart-coverage-reports";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceDir = path.resolve(__dirname, "../..");
const rawCoverageDir = path.join(workspaceDir, "coverage", "e2e", "raw");
const e2eCoverageDir = path.join(workspaceDir, "coverage", "e2e");

console.log("Generating E2E coverage report...");

// Check if coverage data exists
if (!fs.existsSync(rawCoverageDir)) {
    console.error("Error: Coverage data not found");
    console.error(`Path searched: ${rawCoverageDir}`);
    console.error("\nFirst, run E2E tests with the following command:");
    console.error("  COVERAGE=true npm run test:e2e");
    process.exit(1);
}

const coverageFiles = fs.readdirSync(rawCoverageDir).filter((f) => f.endsWith(".json"));

if (coverageFiles.length === 0) {
    console.error("Error: Coverage data not found");
    console.error(`Path searched: ${rawCoverageDir}`);
    process.exit(1);
}

console.log(`  ✓ ${coverageFiles.length} coverage files found`);

// Preparing coverage report (output destination, etc.)
const coverageReport = new CoverageReport({
    name: "E2E Coverage Report",
    outputDir: e2eCoverageDir,
    // Output only JSON (Istanbul map) and console-summary to save memory
    reports: ["json", "console-summary"],
    // sourceFilter: Filtering source files extracted from source maps
    // NOTE: Do not use entryFilter. Filtering V8 coverage entries is
    //       done manually before add(). This avoids the issue where
    //       JavaScript files are excluded in monocart-coverage-reports internal processing.
    sourceFilter: (sourcePath) => {
        // Exclude node_modules/
        // NOTE: sourcePath can be filename only or full path
        //       If filename only, include all (already filtered by entryFilter)
        if (sourcePath.includes("/node_modules/") || sourcePath.includes("node_modules/")) {
            return false;
        }
        // Include all (already filtered to src/ only by entryFilter)
        return true;
    },
});

// Add and release sequentially per file to avoid large memory consumption
let totalEntries = 0;
let jsEntries = 0;
let cssEntries = 0;
for (const file of coverageFiles) {
    const filePath = path.join(rawCoverageDir, file);
    const text = fs.readFileSync(filePath, "utf8");
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.warn(`[MCR] Skipping due to JSON parse failure: ${filePath}`);
        console.warn(`${e}`);
        continue;
    }

    // Expected format: V8 (Array) or Istanbul (Object). Otherwise skip.
    if (Array.isArray(data)) {
        // Manually filter V8 coverage data
        // NOTE: Because there is an issue where JavaScript files are excluded
        //       when using monocart-coverage-reports entryFilter,
        //       perform manual filtering before add()
        const filtered = data.filter((entry) => {
            const url = entry?.url || "";
            // Target only files under src/ (exclude node_modules/)
            // Exclude empty URLs (anonymous scripts)
            if (!url) return false;
            if (url.includes("/node_modules/")) return false;
            // Include files under src/ or CSS files
            return url.includes("/src/");
        });

        totalEntries += data.length;
        // Count JavaScript and CSS entries
        for (const entry of filtered) {
            const url = entry?.url || "";
            if (url.includes(".css")) {
                cssEntries++;
            } else {
                jsEntries++;
            }
        }

        if (filtered.length > 0) {
            await coverageReport.add(filtered);
        }
    } else if (data && typeof data === "object") {
        // Add as is if Istanbul format (Object)
        await coverageReport.add(data);
        // Count is unknown so do not aggregate
    } else {
        console.warn(`[MCR] Skip unsupported coverage format: ${filePath}`);
    }
}

console.log(`  ✓ ${totalEntries} coverage entries loaded`);
console.log(`    - JavaScript: ${jsEntries} entries`);
console.log(`    - CSS: ${cssEntries} entries`);

// Prepare to fix function execution counts before generate() to preserve V8 coverage data
// Because raw directory might be deleted after generate(),
// extract function execution counts from V8 coverage data beforehand
console.log("\nExtracting function execution counts from V8 coverage...");
const functionCounts = new Map(); // Map<fileName, Map<functionName, count>>

function normalizeUrl(url) {
    const match = url.match(/\/src\/[^?]+/);
    if (!match) return null;
    const filePath = match[0].substring(5);
    return path.basename(filePath);
}

for (const file of coverageFiles) {
    const filePath = path.join(rawCoverageDir, file);
    const text = fs.readFileSync(filePath, "utf8");
    let data;
    try {
        data = JSON.parse(text);
    } catch (_e) {
        console.warn(`[MCR] JSON parse failed, skipping:`, _e.message);
        continue;
    }

    if (!Array.isArray(data)) continue;

    for (const entry of data) {
        const url = entry?.url || "";
        if (!url.includes("/src/")) continue;

        const fileName = normalizeUrl(url);
        if (!fileName) continue;

        if (!functionCounts.has(fileName)) {
            functionCounts.set(fileName, new Map());
        }
        const fileFunctionCounts = functionCounts.get(fileName);

        for (const func of entry.functions || []) {
            const functionName = func.functionName;
            if (!functionName) continue;

            const ranges = func.ranges || [];
            if (ranges.length === 0) continue;

            const count = ranges[0].count || 0;
            const existingCount = fileFunctionCounts.get(functionName) || 0;
            if (count > existingCount) {
                fileFunctionCounts.set(functionName, count);
            }
        }
    }
}

console.log(`  ✓ Extracted function execution counts from ${functionCounts.size} files`);

const istanbulJson = path.join(e2eCoverageDir, "coverage-final.json");

try {
    await coverageReport.generate();
    console.log("\n✓ E2E coverage report generation completed");
    if (fs.existsSync(istanbulJson)) {
        console.log(`\nIstanbul JSON: ${istanbulJson}`);

        // Verifying coverage conversion: Checking if JavaScript files are included
        console.log("\nExecuting coverage conversion verification...");
        const coverageData = JSON.parse(fs.readFileSync(istanbulJson, "utf8"));
        const files = Object.keys(coverageData);
        const jsFiles = files.filter((f) => !f.includes(".css"));
        const cssFiles = files.filter((f) => f.includes(".css"));

        console.log(`  - Total files: ${files.length}`);
        console.log(`  - JavaScript files: ${jsFiles.length}`);
        console.log(`  - CSS files: ${cssFiles.length}`);

        // Error if JavaScript entries exist but JavaScript files are 0
        if (jsEntries > 0 && jsFiles.length === 0) {
            console.error("\n❌ Error: JavaScript file coverage lost during conversion");
            console.error(`   In raw coverage: ${jsEntries} JavaScript entries existed,`);
            console.error("   but converted coverage does not contain JavaScript files.");
            console.error("\n   This may be due to an issue with monocart-coverage-reports configuration.");
            console.error("   Check entryFilter and sourceFilter settings.");
            process.exit(1);
        }

        // Warning: If JavaScript files are few
        if (jsEntries > 0 && jsFiles.length < jsEntries * 0.1) {
            console.warn("\n⚠️  Warning: Number of JavaScript files is less than expected");
            console.warn(`   Raw coverage: ${jsEntries} JavaScript entries`);
            console.warn(`   After conversion: ${jsFiles.length} JavaScript files`);
            console.warn("   Some files may have been excluded.");
        }

        console.log("\n✓ Coverage conversion verification completed");
    } else {
        // Search top-level .json and save as coverage-final.json in case MCR json output filename differs
        const candidates = fs
            .readdirSync(e2eCoverageDir)
            .filter((f) => f.endsWith(".json") && f !== "coverage-final.json");
        if (candidates.length > 0) {
            const src = path.join(e2eCoverageDir, candidates[0]);
            fs.copyFileSync(src, istanbulJson);
            console.warn(`[MCR] Note: copied ${candidates[0]} to coverage-final.json`);
            console.log(`\nIstanbul JSON: ${istanbulJson}`);
        } else {
            console.log(`\nOutput: ${e2eCoverageDir}`);
            console.warn("[MCR] Note: coverage-final.json not found. Check json output name.");
        }
    }
} catch (error) {
    console.error("Error: Failed to generate coverage report:", error);
    process.exit(1);
}

// Fixing function execution counts lost during conversion from V8 coverage to Istanbul format
console.log("\nFixing function execution counts from V8 coverage...");
try {
    const istanbulCoverage = JSON.parse(fs.readFileSync(istanbulJson, "utf8"));
    let totalFixed = 0;
    let totalFunctions = 0;

    for (const [filePath, coverage] of Object.entries(istanbulCoverage)) {
        const fileName = path.basename(filePath);
        const fileFunctionCounts = functionCounts.get(fileName);
        if (!fileFunctionCounts) continue;

        const fnMap = coverage.fnMap || {};
        const f = coverage.f || {};

        for (const [fnId, fnInfo] of Object.entries(fnMap)) {
            totalFunctions++;
            const functionName = fnInfo.name;
            const v8Count = fileFunctionCounts.get(functionName);

            if (v8Count !== undefined && v8Count !== f[fnId]) {
                const oldCount = f[fnId];
                f[fnId] = v8Count;
                totalFixed++;

                if (oldCount === 0 && v8Count > 0) {
                    console.log(
                        `  Fixed: ${fileName} - ${functionName}: ${oldCount} -> ${v8Count}`,
                    );
                }
            }
        }
    }

    console.log(`  ✓ ${totalFixed} execution counts fixed out of ${totalFunctions} functions`);

    // Save fixed coverage data
    fs.writeFileSync(istanbulJson, JSON.stringify(istanbulCoverage, null, 2));
    console.log(`  ✓ Saved to ${istanbulJson}`);
    console.log("\n✓ Function execution count fix completed");
} catch (error) {
    console.error("⚠ Failed to fix function execution counts:", error.message);
    console.error("  Coverage data generated but some function execution counts may be inaccurate");
}
