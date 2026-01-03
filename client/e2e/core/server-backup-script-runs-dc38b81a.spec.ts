import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("backup script creates archive", async () => {
    const root = path.resolve(__dirname, "../../..");
    const backupDir = path.join(root, "server", "e2e-backups");
    const sourceDir = path.join(root, "server", "e2e-src");
    await fs.promises.rm(backupDir, { recursive: true, force: true });
    await fs.promises.rm(sourceDir, { recursive: true, force: true });
    await fs.promises.mkdir(sourceDir, { recursive: true });
    await fs.promises.writeFile(path.join(sourceDir, "file.txt"), "e2e");
    process.env.BACKUP_DIR = backupDir;
    process.env.BACKUP_SOURCE = sourceDir;
    process.env.RCLONE_REMOTE = "";
    await execFileAsync("node", ["server/scripts/rclone-backup.cjs"], { cwd: root });
    const files = await fs.promises.readdir(backupDir);
    expect(files.length).toBe(1);
});
