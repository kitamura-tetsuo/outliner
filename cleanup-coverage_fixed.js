#!/usr/bin/env node

/**
 * Deletes old coverage JSON files so that fresh coverage data can be obtained for each test run.
 * - Removes JSON files other than coverage-final.json from unit_and_integration/
 * - Removes all JSON files from e2e/raw/
 * - Removes old merged coverage data from merged/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceDir = path.resolve(__dirname, "../..");
const coverageDir = path.join(workspaceDir, "coverage");

// Configuration for each subdirectory
const cleanupDirs = [
    {
        name: "unit_and_integration",
        keepFile: "coverage-final.json",
    },
    {
        name: "e2e/raw",
        keepFile: null, // Delete all JSON files
    },
    {
        name: "merged",
        keepFile: null, // Delete all JSON files
    },
];

/**
 * Deletes old JSON files from the specified directory
 */
function cleanupDirectory(dirPath, keepFile = null) {
    if (!fs.existsSync(dirPath)) {
        return 0; // Skip if directory does not exist
    }

    let removedCount = 0;

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            // Skip directories
            if (entry.isDirectory()) {
                continue;
            }

            const filePath = path.join(dirPath, entry.name);

            // Do not delete the file if keepFile is specified
            if (keepFile && entry.name === keepFile) {
                continue;
            }

            // Delete only JSON files
            if (entry.name.endsWith(".json")) {
                fs.unlinkSync(filePath);
                console.log(`[coverage:cleanup] deleted: ${path.relative(workspaceDir, filePath)}`);
                removedCount++;
            }
        }
    } catch (e) {
        console.error(`[coverage:cleanup] failed to cleanup ${dirPath}:`, e);
    }

    return removedCount;
}

function main() {
    let totalRemoved = 0;

    console.log("[coverage:cleanup] cleaning up old coverage files...");

    // Process each directory
    for (const dirConfig of cleanupDirs) {
        const dirPath = path.join(coverageDir, dirConfig.name);

        if (!fs.existsSync(dirPath)) {
            // Skip without error if directory does not exist
            continue;
        }

        const removed = cleanupDirectory(dirPath, dirConfig.keepFile);
        totalRemoved += removed;

        if (removed > 0) {
            console.log(`[coverage:cleanup] removed ${removed} file(s) from ${path.relative(workspaceDir, dirPath)}/`);
        }
    }

    console.log("[coverage:cleanup] cleanup completed");

    // Appropriate message if nothing was removed
    if (totalRemoved === 0) {
        console.log("[coverage:cleanup] no old coverage files found to delete");
    } else {
        console.log(`[coverage:cleanup] total: ${totalRemoved} file(s) removed`);
    }

    // Always exit with success status
    process.exit(0);
}

main();
