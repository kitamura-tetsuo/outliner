#!/usr/bin/env node

/**
 * coverage ディレクトリをタイムスタンプ付きでバックアップします。
 * 出力先: coverage/_backups/<YYYYMMDD-HHMMSS>
 * 例: coverage/_backups/2025-10-10-14-23-05
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

function main() {
    if (!fs.existsSync(coverageDir)) {
        console.log(`[coverage:backup] skip: no coverage directory: ${coverageDir}`);
        process.exit(0);
    }

    fs.mkdirSync(backupsRoot, { recursive: true });
    const dest = path.join(backupsRoot, timestamp());

    console.log(`[coverage:backup] backing up: ${coverageDir} -> ${dest}`);

    try {
        // Node v16+ : fs.cpSync でディレクトリごとコピー
        fs.cpSync(coverageDir, dest, { recursive: true });
    } catch (e) {
        console.error("[coverage:backup] backup failed:", e);
        process.exit(1);
    }

    console.log("[coverage:backup] done");
}

main();
