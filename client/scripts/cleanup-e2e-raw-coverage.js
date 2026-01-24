#!/usr/bin/env node

/**
 * Clean up duplicate coverage files in the e2e/raw/ directory.
 * If there are multiple coverage files for the same test, keep only the latest one and delete the others.
 * Filename format: coverage-<TEST_NAME>-<TIMESTAMP>.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceDir = path.resolve(__dirname, "../..");
const coverageRawDir = path.join(workspaceDir, "coverage/e2e/raw");

function cleanupE2eRawCoverage() {
    if (!fs.existsSync(coverageRawDir)) {
        console.log(`[cleanup-e2e-raw] Directory not found: ${coverageRawDir}`);
        return;
    }

    console.log(`[cleanup-e2e-raw] Cleaning up duplicate coverage files in ${coverageRawDir}...`);

    try {
        const files = fs.readdirSync(coverageRawDir).filter(f => f.endsWith(".json"));
        const groups = new Map();

        // Group files by test name
        for (const file of files) {
            // Match: coverage-<TEST_NAME>-<TIMESTAMP>.json
            // Use regex to capture the part before the last hyphen-digits
            const match = file.match(/^coverage-(.+)-(\d+)\.json$/);

            if (match) {
                const testName = match[1];
                const timestamp = parseInt(match[2], 10);

                if (!groups.has(testName)) {
                    groups.set(testName, []);
                }
                groups.get(testName).push({ file, timestamp });
            } else {
                // If format doesn't match, ignore or handle?
                // For now, ignore files that don't match the expected pattern
                // console.warn(`[cleanup-e2e-raw] Skipping file with unexpected format: ${file}`);
            }
        }

        let removedCount = 0;

        // Process each group
        for (const entries of groups.values()) {
            if (entries.length > 1) {
                // Sort by timestamp descending (newest first)
                entries.sort((a, b) => b.timestamp - a.timestamp);

                // Keep the first one (index 0), delete the rest
                const toDelete = entries.slice(1);

                for (const entry of toDelete) {
                    const filePath = path.join(coverageRawDir, entry.file);
                    fs.unlinkSync(filePath);
                    // console.log(`[cleanup-e2e-raw] Deleted old coverage: ${entry.file}`);
                    removedCount++;
                }
            }
        }

        if (removedCount > 0) {
            console.log(`[cleanup-e2e-raw] Removed ${removedCount} old coverage file(s).`);
        } else {
            console.log("[cleanup-e2e-raw] No duplicate coverage files found.");
        }
    } catch (e) {
        console.error("[cleanup-e2e-raw] Error during cleanup:", e);
        process.exit(1);
    }
}

cleanupE2eRawCoverage();
