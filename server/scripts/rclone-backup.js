#!/usr/bin/env node
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const path = require("path");

const execFileAsync = promisify(execFile);

function getConfig() {
    const backupDir = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
    const sourceDir = process.env.BACKUP_SOURCE || path.join(__dirname, "..", "data");
    const rcloneBin = process.env.RCLONE_BIN || "rclone";
    const rcloneRemote = process.env.RCLONE_REMOTE;
    const envVal = process.env.BACKUP_RETENTION_DAYS;
    const parsed = Number(envVal);
    let retentionDays = 7;
    if (envVal !== undefined) {
        if (Number.isInteger(parsed) && parsed > 0) {
            retentionDays = parsed;
        } else {
            console.warn(
                `Invalid BACKUP_RETENTION_DAYS "${envVal}", using default 7`,
            );
        }
    }

    return {
        backupDir,
        sourceDir,
        rcloneBin,
        rcloneRemote,
        retentionDays,
    };
}

function getTimestamp() {
    const d = new Date();
    return d.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}Z$/, "");
}

async function createArchive() {
    const { backupDir, sourceDir } = getConfig();
    await fs.mkdir(backupDir, { recursive: true });
    const archiveName = `backup-${getTimestamp()}.tar.gz`;
    const archivePath = path.join(backupDir, archiveName);
    await execFileAsync("tar", ["-czf", archivePath, "-C", sourceDir, "."]);
    return archivePath;
}

async function uploadArchive(archivePath) {
    const { rcloneBin, rcloneRemote } = getConfig();
    if (!rcloneRemote) {
        console.log("RCLONE_REMOTE not set, skipping upload");
        return;
    }
    await execFileAsync(rcloneBin, ["copy", archivePath, rcloneRemote]);
}

async function pruneOldBackups(retentionDays) {
    const { backupDir, retentionDays: cfgRetention } = getConfig();
    const limit = Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : cfgRetention;
    const files = await fs.readdir(backupDir);
    const now = Date.now();
    await Promise.all(
        files.map(async (f) => {
            const full = path.join(backupDir, f);
            const stat = await fs.stat(full);
            if (now - stat.mtimeMs > limit * 24 * 60 * 60 * 1000) {
                await fs.unlink(full);
            }
        }),
    );
}

async function main() {
    const archive = await createArchive();
    await uploadArchive(archive);
    await pruneOldBackups();
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { createArchive, uploadArchive, pruneOldBackups };
