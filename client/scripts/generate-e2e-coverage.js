#!/usr/bin/env node

/**
 * Script to generate E2E test coverage reports
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
    console.error(`Searched path: ${rawCoverageDir}`);
    console.error("\nFirst, please run E2E tests with the following command:");
    console.error("  COVERAGE=true npm run test:e2e");
    process.exit(1);
}

const coverageFiles = fs.readdirSync(rawCoverageDir).filter((f) => f.endsWith(".json"));

if (coverageFiles.length === 0) {
    console.error("Error: Coverage data not found");
    console.error(`Searched path: ${rawCoverageDir}`);
    process.exit(1);
}

console.log(`  ✓ Found ${coverageFiles.length} coverage files`);

// Prepare coverage report (output destination, etc.)
const coverageReport = new CoverageReport({
    name: "E2E Coverage Report",
    outputDir: e2eCoverageDir,
    // Output only JSON (Istanbul map) and console-summary to save memory
    reports: ["json", "console-summary"],
    // sourceFilter: Filter source files extracted from source maps
    // NOTE: entryFilter is not used. V8 coverage entry filtering is performed manually
    //       before add(). This avoids the issue where JavaScript files are excluded
    //       by the internal processing of monocart-coverage-reports.
    sourceFilter: (sourcePath) => {
        // Exclude node_modules/
        // NOTE: sourcePath can be just the filename or the full path
        //       If it is just the filename, include all (already filtered by entryFilter)
        if (sourcePath.includes("/node_modules/") || sourcePath.includes("node_modules/")) {
            return false;
        }
        // Include all (already filtered to under src/ by entryFilter)
        return true;
    },
});

// Sequentially add and release each file to avoid large memory consumption
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

    // Expected format: V8(Array) or Istanbul(Object). Skip others
    if (Array.isArray(data)) {
        // Manually filter V8 coverage data
        // NOTE: Using monocart-coverage-reports entryFilter has an issue where
        //       JavaScript files are excluded, so perform filtering manually before add()
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
        // Add as is for Istanbul format (Object)
        await coverageReport.add(data);
        // Do not sum up as the count is unknown
    } else {
        console.warn(`[MCR] Skip unsupported coverage format: ${filePath}`);
    }
}

console.log(`  ✓ Loaded ${totalEntries} coverage entries`);
console.log(`    - JavaScript: ${jsEntries} entries`);
console.log(`    - CSS: ${cssEntries} entries`);

// Prepare for fixing function execution counts before generate() to keep V8 coverage data
// Note: Since the raw directory might be deleted after generate(),
//       extract function execution counts from V8 coverage data in advance
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

        // Verify coverage conversion: Check if JavaScript files are included
        console.log("\nVerifying coverage conversion...");
        const coverageData = JSON.parse(fs.readFileSync(istanbulJson, "utf8"));
        const files = Object.keys(coverageData);
        const jsFiles = files.filter((f) => !f.includes(".css"));
        const cssFiles = files.filter((f) => f.includes(".css"));

        console.log(`  - Total files: ${files.length}`);
        console.log(`  - JavaScript files: ${jsFiles.length}`);
        console.log(`  - CSS files: ${cssFiles.length}`);

        // Error if JavaScript entries existed but 0 JavaScript files
        if (jsEntries > 0 && jsFiles.length === 0) {
            console.error("\n❌ Error: JavaScript file coverage lost during conversion");
            console.error(`   ${jsEntries} JavaScript entries existed in raw coverage,`);
            console.error("   but converted coverage contains no JavaScript files.");
            console.error("\n   This may be an issue with monocart-coverage-reports configuration.");
            console.error("   Check entryFilter and sourceFilter settings.");
            process.exit(1);
        }

        // Warning: If JavaScript files are few
        if (jsEntries > 0 && jsFiles.length < jsEntries * 0.1) {
            console.warn("\n⚠️  Warning: Fewer JavaScript files than expected");
            console.warn(`   Raw coverage: ${jsEntries} JavaScript entries`);
            console.warn(`   Converted: ${jsFiles.length} JavaScript files`);
            console.warn("   Some files may have been excluded.");
        }

        console.log("\n✓ Coverage conversion verification completed");
    } else {
        // In case MCR json output filename differs, search for top-level .json and save as coverage-final.json
        const candidates = fs
            .readdirSync(e2eCoverageDir)
            .filter((f) => f.endsWith(".json") && f !== "coverage-final.json");
        if (candidates.length > 0) {
            const src = path.join(e2eCoverageDir, candidates[0]);
            fs.copyFileSync(src, istanbulJson);
            console.warn(`[MCR] Note: Copied ${candidates[0]} to coverage-final.json`);
            console.log(`\nIstanbul JSON: ${istanbulJson}`);
        } else {
            console.log(`\nOutput directory: ${e2eCoverageDir}`);
            console.warn("[MCR] Note: coverage-final.json not found. Check json output name.");
        }
    }
} catch (error) {
    console.error("Error: Failed to generate coverage report:", error);
    process.exit(1);
}

// Fix function execution counts lost during V8 coverage to Istanbul format conversion
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
                        `  Fix: ${fileName} - ${functionName}: ${oldCount} -> ${v8Count}`,
                    );
                }
            }
        }
    }

    console.log(`  ✓ Fixed execution counts for ${totalFixed} out of ${totalFunctions} functions`);

    // Save fixed coverage data
    fs.writeFileSync(istanbulJson, JSON.stringify(istanbulCoverage, null, 2));
    console.log(`  ✓ Saved to ${istanbulJson}`);
    console.log("\n✓ Fix of function execution counts completed");
} catch (error) {
    console.error("⚠ Failed to fix function execution counts:", error.message);
    console.error("  Coverage data has been generated, but some function execution counts may be inaccurate");
}
