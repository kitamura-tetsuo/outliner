#!/usr/bin/env node

/**
 * Back up the coverage directory with a timestamp.
 * - Move (not copy) the coverage directory to coverage-backups
 * - Automatically delete backups older than 10
 * Output destination: coverage-backups/<YYYYMMDD-HHMMSS>
 * Example: coverage-backups/2025-10-29-14-23-05
 *
 * This script is executed at the start of the test to move the previous coverage and save disk space.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceDir = path.resolve(__dirname, "../..");
const coverageDir = path.join(workspaceDir, "coverage");
const backupsRoot = path.join(workspaceDir, "coverage-backups");

function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${
        pad(d.getMinutes())
    }-${pad(d.getSeconds())}`;
}

/**
 * Delete old backups (keep the latest 10)
 */
function pruneOldBackups() {
    if (!fs.existsSync(backupsRoot)) {
        return;
    }

    try {
        const entries = fs.readdirSync(backupsRoot, { withFileTypes: true });
        const backupDirs = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => ({
                name: entry.name,
                path: path.join(backupsRoot, entry.name),
                mtime: fs.statSync(path.join(backupsRoot, entry.name)).mtime,
            }))
            .sort((a, b) => b.mtime - a.mtime); // Sort by newness

        // Delete backups older than 10
        const toDelete = backupDirs.slice(10);
        if (toDelete.length > 0) {
            console.log(`[coverage:move-to-backup] pruning ${toDelete.length} old backup(s)...`);
            for (const backup of toDelete) {
                console.log(`[coverage:move-to-backup] deleting: ${backup.name}`);
                fs.rmSync(backup.path, { recursive: true, force: true });
            }
        }
    } catch (e) {
        console.error("[coverage:move-to-backup] failed to prune old backups:", e);
        // Continue backup process even if an error occurs
    }
}

function main() {
    if (!fs.existsSync(coverageDir)) {
        console.log(`[coverage:move-to-backup] skip: no coverage directory: ${coverageDir}`);
        process.exit(0);
    }

    fs.mkdirSync(backupsRoot, { recursive: true });
    const dest = path.join(backupsRoot, timestamp());

    console.log(`[coverage:move-to-backup] moving: ${coverageDir} -> ${dest}`);

    try {
        // Move coverage directory (not copy)
        fs.renameSync(coverageDir, dest);
    } catch (e) {
        console.error("[coverage:move-to-backup] move failed:", e);
        process.exit(1);
    }

    console.log("[coverage:move-to-backup] move completed");

    // Delete old backups
    pruneOldBackups();

    console.log("[coverage:move-to-backup] done");
}

main();
