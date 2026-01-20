#!/usr/bin/env node
import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

export function getConfig() {
    return {
        backupDir: process.env.BACKUP_DIR || path.join(__dirname, "..", "..", "backups"),
        sourceDir: process.env.BACKUP_SOURCE || path.join(__dirname, "..", "..", "data"),
        rcloneBin: process.env.RCLONE_BIN || "rclone",
        rcloneRemote: process.env.RCLONE_REMOTE,
        retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || "7"),
    };
}

function getTimestamp() {
    const d = new Date();
    return d.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}Z$/, "");
}

export async function createArchive() {
    const { backupDir, sourceDir } = getConfig();
    await fs.mkdir(backupDir, { recursive: true });
    const archiveName = `backup-${getTimestamp()}.tar.gz`;
    const archivePath = path.join(backupDir, archiveName);
    await execFileAsync("tar", ["-czf", archivePath, "-C", sourceDir, "."]);
    return archivePath;
}

export async function uploadArchive(archivePath: string) {
    const { rcloneBin, rcloneRemote } = getConfig();
    if (!rcloneRemote) {
        console.log("RCLONE_REMOTE not set, skipping upload");
        return;
    }
    await execFileAsync(rcloneBin, ["copy", archivePath, rcloneRemote]);
}

export async function pruneOldBackups(retentionDays?: number) {
    const { backupDir, retentionDays: cfgRetention } = getConfig();
    const limit = retentionDays || cfgRetention;
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

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
