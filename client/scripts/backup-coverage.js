#!/usr/bin/env node

/**
 * Backup coverage directory with timestamp.
 * - Copy (not move) coverage directory to coverage-backups
 * - Automatically delete backups older than 10
 * Output: coverage-backups/<YYYYMMDD-HHMMSS>
 * Example: coverage-backups/2025-10-29-14-23-05
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
 * Delete old backups (keep latest 10)
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
            .sort((a, b) => b.mtime - a.mtime); // Sort by newest

        // Delete backups older than 10
        const toDelete = backupDirs.slice(10);
        if (toDelete.length > 0) {
            console.log(`[coverage:backup] pruning ${toDelete.length} old backup(s)...`);
            for (const backup of toDelete) {
                console.log(`[coverage:backup] deleting: ${backup.name}`);
                fs.rmSync(backup.path, { recursive: true, force: true });
            }
        }
    } catch (e) {
        console.error("[coverage:backup] failed to prune old backups:", e);
        // Continue backup process even if error occurs
    }
}

function main() {
    if (!fs.existsSync(coverageDir)) {
        console.log(`[coverage:backup] skip: no coverage directory: ${coverageDir}`);
        process.exit(0);
    }

    fs.mkdirSync(backupsRoot, { recursive: true });
    const dest = path.join(backupsRoot, timestamp());

    console.log(`[coverage:backup] copying: ${coverageDir} -> ${dest}`);

    try {
        // Copy coverage directory (not move)
        fs.cpSync(coverageDir, dest, { recursive: true });
    } catch (e) {
        console.error("[coverage:backup] backup failed:", e);
        process.exit(1);
    }

    console.log("[coverage:backup] backup completed");

    // Delete old backups
    pruneOldBackups();

    console.log("[coverage:backup] done");
}

main();
