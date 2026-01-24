#!/usr/bin/env node

/**
 * Script to fix function execution counts lost during conversion from V8 coverage to Istanbul format
 *
 * Problem:
 * When monocart-coverage-reports converts V8 coverage to Istanbul format,
 * execution counts for event handlers and callbacks are not converted correctly.
 *
 * Solution:
 * Extract function execution counts from V8 coverage raw data and
 * reflect them in the Istanbul format coverage data.
 *
 * Usage:
 *   node scripts/fix-istanbul-function-counts.js
 *
 * Prerequisites:
 *   - V8 coverage data exists in coverage/e2e/raw/
 *   - Istanbul format coverage data exists in coverage/e2e/coverage-final.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Support execution from client/scripts and workspace
const isInClientDir = __dirname.includes("/client/scripts");
const workspaceDir = isInClientDir ? path.resolve(__dirname, "../..") : path.resolve(__dirname, "..");
const rawCoverageDir = path.join(workspaceDir, "coverage", "e2e", "raw");
const istanbulCoverageFile = path.join(workspaceDir, "coverage", "e2e", "coverage-final.json");

console.log("Starting fix of function execution counts from V8 coverage to Istanbul format...");

// Check if V8 coverage data exists
if (!fs.existsSync(rawCoverageDir)) {
    console.error("Error: V8 coverage data not found");
    console.error(`Searched path: ${rawCoverageDir}`);
    process.exit(1);
}

// Check if Istanbul format coverage data exists
if (!fs.existsSync(istanbulCoverageFile)) {
    console.error("Error: Istanbul format coverage data not found");
    console.error(`Searched path: ${istanbulCoverageFile}`);
    process.exit(1);
}

// Extract function execution counts from V8 coverage data
const coverageFiles = fs.readdirSync(rawCoverageDir).filter((f) => f.endsWith(".json"));
console.log(`  ✓ Found ${coverageFiles.length} V8 coverage files`);

// Get normalized filename from URL
function normalizeUrl(url) {
    // http://localhost:7090/src/components/OutlinerItem.svelte?t=1760180780335
    // -> OutlinerItem.svelte
    const match = url.match(/\/src\/[^?]+/);
    if (!match) return null;
    const filePath = match[0].substring(5); // Remove "/src/"
    return path.basename(filePath);
}

// Extract function execution counts from V8 coverage
const functionCounts = new Map(); // Map<fileName, Map<functionName, count>>

for (const file of coverageFiles) {
    const filePath = path.join(rawCoverageDir, file);
    const text = fs.readFileSync(filePath, "utf8");
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error(`Failed to parse JSON: ${filePath}`, e.message);
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

            // In V8 coverage, function execution count is recorded in the count of the first range
            const ranges = func.ranges || [];
            if (ranges.length === 0) continue;

            const count = ranges[0].count || 0;

            // Compare with existing count and adopt the larger one (when executed in multiple test files)
            const existingCount = fileFunctionCounts.get(functionName) || 0;
            if (count > existingCount) {
                fileFunctionCounts.set(functionName, count);
            }
        }
    }
}

console.log(`  ✓ Extracted function execution counts from ${functionCounts.size} files`);

// Load Istanbul format coverage data
const istanbulCoverage = JSON.parse(fs.readFileSync(istanbulCoverageFile, "utf8"));

// Fix function execution counts
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
fs.writeFileSync(istanbulCoverageFile, JSON.stringify(istanbulCoverage, null, 2));
console.log(`  ✓ Saved to ${istanbulCoverageFile}`);

console.log("\n✓ Fix of function execution counts completed");

// Show list of fixed functions
if (totalFixed > 0) {
    console.log("\nFixed functions:");
    for (const [filePath, coverage] of Object.entries(istanbulCoverage)) {
        const fileName = path.basename(filePath);
        const fileFunctionCounts = functionCounts.get(fileName);
        if (!fileFunctionCounts) continue;

        const fnMap = coverage.fnMap || {};
        const f = coverage.f || {};

        for (const [fnId, fnInfo] of Object.entries(fnMap)) {
            const functionName = fnInfo.name;
            const v8Count = fileFunctionCounts.get(functionName);

            if (v8Count !== undefined && v8Count > 0 && f[fnId] === v8Count) {
                console.log(`  - ${fileName}:${fnInfo.loc.start.line} ${functionName} (${v8Count} count)`);
            }
        }
    }
}
