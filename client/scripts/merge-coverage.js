#!/usr/bin/env node

/**
 * Script to merge coverage reports
 *
 * Merges coverage for unit/integration/e2e tests and
 * generates a unified report.
 *
 * Usage:
 *   node scripts/merge-coverage.js
 *
 * Prerequisites:
 *   - unit/integration/e2e tests must be executed
 *   - Coverage data for each test must be generated
 */

import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libCoverage = require("istanbul-lib-coverage");
const libReport = require("istanbul-lib-report");
const reports = require("istanbul-reports");

// Path to coverage directory
const workspaceDir = path.resolve(__dirname, "../..");
const coverageDir = path.join(workspaceDir, "coverage");
const unitAndIntegrationCoverageFile = path.join(coverageDir, "unit_and_integration", "coverage-final.json");
const e2eCoverageFile = path.join(coverageDir, "e2e", "coverage-final.json");
const mergedCoverageFile = path.join(coverageDir, "merged", "coverage-final.json");
const mergedReportDir = path.join(coverageDir, "merged");

console.log("Starting coverage report merge...");

// Create coverage map
const coverageMap = libCoverage.createCoverageMap();

// Read and merge each coverage file
let filesFound = 0;
const coverageSources = [];

// Add Unit/Integration test coverage
// Vitest merges coverage for all projects into a single file
if (fs.existsSync(unitAndIntegrationCoverageFile)) {
    console.log("Loading Unit/Integration test coverage...");
    const unitAndIntegrationCoverage = JSON.parse(fs.readFileSync(unitAndIntegrationCoverageFile, "utf8"));
    const files = Object.keys(unitAndIntegrationCoverage);
    const jsFiles = files.filter((f) => !f.includes(".css"));
    const cssFiles = files.filter((f) => f.includes(".css"));

    coverageMap.merge(unitAndIntegrationCoverage);
    filesFound++;
    coverageSources.push({
        name: "Unit/Integration",
        totalFiles: files.length,
        jsFiles: jsFiles.length,
        cssFiles: cssFiles.length,
    });
    console.log(`  ✓ Added coverage for ${files.length} files`);
    console.log(`    - JavaScript: ${jsFiles.length} entries`);
    console.log(`    - CSS: ${cssFiles.length} entries`);
} else {
    console.log("  ⚠ Unit/Integration test coverage not found");
    console.log(`     Searched path: ${unitAndIntegrationCoverageFile}`);
}

// Add E2E test coverage
if (fs.existsSync(e2eCoverageFile)) {
    console.log("Loading E2E test coverage...");
    const e2eCoverage = JSON.parse(fs.readFileSync(e2eCoverageFile, "utf8"));
    const files = Object.keys(e2eCoverage);
    const jsFiles = files.filter((f) => !f.includes(".css"));
    const cssFiles = files.filter((f) => f.includes(".css"));

    coverageMap.merge(e2eCoverage);
    filesFound++;
    coverageSources.push({
        name: "E2E",
        totalFiles: files.length,
        jsFiles: jsFiles.length,
        cssFiles: cssFiles.length,
    });
    console.log(`  ✓ Added coverage for ${files.length} files`);
    console.log(`    - JavaScript: ${jsFiles.length} entries`);
    console.log(`    - CSS: ${cssFiles.length} entries`);

    // Verify E2E coverage: Check if JavaScript files are included
    if (jsFiles.length === 0 && cssFiles.length > 0) {
        console.error("\n❌ Error: E2E coverage does not contain JavaScript files");
        console.error("   Only CSS files are included.");
        console.error("   This may be an issue during E2E coverage generation.");
        console.error("\n   Please check the following:");
        console.error("   1. entryFilter setting in scripts/generate-e2e-coverage.js");
        console.error("   2. sourceFilter setting in scripts/generate-e2e-coverage.js");
        console.error("   3. monocart-coverage-reports version");
        process.exit(1);
    }
} else {
    console.log("  ⚠ E2E test coverage not found");
    console.log(`     Searched path: ${e2eCoverageFile}`);
}

if (filesFound === 0) {
    console.error("\nError: Coverage files not found");
    console.error("First, please run tests with the following commands:");
    console.error("  npm run test:unit");
    console.error("  npm run test:integration");
    console.error("  COVERAGE=true npm run test:e2e");
    process.exit(1);
}

// Save merged coverage
console.log("\nSaving merged coverage...");
fs.mkdirSync(mergedReportDir, { recursive: true });
fs.writeFileSync(mergedCoverageFile, JSON.stringify(coverageMap.toJSON(), null, 2));
console.log(`  ✓ Saved to ${mergedCoverageFile}`);

// Generate reports
console.log("\nGenerating reports...");
const context = libReport.createContext({
    dir: mergedReportDir,
    coverageMap: coverageMap,
});

// HTML Report
console.log("  - HTML Report");
const htmlReport = reports.create("html", {});
htmlReport.execute(context);

// Text Report (Console output)
console.log("  - Text Report");
const textReport = reports.create("text", {});
textReport.execute(context);

// LCOV Report (For CI/CD)
console.log("  - LCOV Report");
const lcovReport = reports.create("lcov", {});
lcovReport.execute(context);

// JSON Report
console.log("  - JSON Report");
const jsonReport = reports.create("json", {});
jsonReport.execute(context);

console.log("\n✓ Coverage report merge completed");
console.log(`\nReport location: ${mergedReportDir}/index.html`);

// Display coverage source summary
if (coverageSources.length > 0) {
    console.log("\nCoverage sources:");
    for (const source of coverageSources) {
        console.log(`  ${source.name}:`);
        console.log(`    - Total files: ${source.totalFiles}`);
        console.log(`    - JavaScript: ${source.jsFiles} entries`);
        console.log(`    - CSS: ${source.cssFiles} entries`);
    }
}

console.log("\nCoverage Summary:");

// Display summary
const summary = coverageMap.getCoverageSummary();
console.log(
    `  Statements   : ${
        summary.statements.pct.toFixed(2)
    }% ( ${summary.statements.covered}/${summary.statements.total} )`,
);
console.log(
    `  Branches     : ${summary.branches.pct.toFixed(2)}% ( ${summary.branches.covered}/${summary.branches.total} )`,
);
console.log(
    `  Functions    : ${summary.functions.pct.toFixed(2)}% ( ${summary.functions.covered}/${summary.functions.total} )`,
);
console.log(`  Lines        : ${summary.lines.pct.toFixed(2)}% ( ${summary.lines.covered}/${summary.lines.total} )`);
