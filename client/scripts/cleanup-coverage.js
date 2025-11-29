#!/usr/bin/env node

/**
 * 古い coverage JSON ファイルを削除して、各テスト実行で fresh coverage データを取得できるようにします。
 * - unit_and_integration/ から coverage-final.json 以外の JSON ファイルを削除
 * - e2e/raw/ から全ての JSON ファイルを削除
 * - merged/ から古いマージされた coverage データを削除
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceDir = path.resolve(__dirname, "../..");
const coverageDir = path.join(workspaceDir, "coverage");

// 各サブディレクトリの設定
const cleanupDirs = [
    {
        name: "unit_and_integration",
        keepFile: "coverage-final.json",
    },
    {
        name: "e2e/raw",
        keepFile: null, // 全てのJSONファイルを削除
    },
    {
        name: "merged",
        keepFile: null, // 全てのJSONファイルを削除
    },
];

/**
 * 指定されたディレクトリから古い JSON ファイルを削除します
 */
function cleanupDirectory(dirPath, keepFile = null) {
    if (!fs.existsSync(dirPath)) {
        return 0; // ディレクトリが存在しない場合はスキップ
    }

    let removedCount = 0;

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            // ディレクトリはスキップ
            if (entry.isDirectory()) {
                continue;
            }

            const filePath = path.join(dirPath, entry.name);

            // keepFile が指定されている場合、そのファイルは削除しない
            if (keepFile && entry.name === keepFile) {
                continue;
            }

            // JSON ファイルのみ削除
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

    // 各ディレクトリを処理
    for (const dirConfig of cleanupDirs) {
        const dirPath = path.join(coverageDir, dirConfig.name);

        if (!fs.existsSync(dirPath)) {
            // ディレクトリが存在しない場合はスキップしてエラーにしない
            continue;
        }

        const removed = cleanupDirectory(dirPath, dirConfig.keepFile);
        totalRemoved += removed;

        if (removed > 0) {
            console.log(`[coverage:cleanup] removed ${removed} file(s) from ${path.relative(workspaceDir, dirPath)}/`);
        }
    }

    console.log("[coverage:cleanup] cleanup completed");

    // 何もない場合は適切なメッセージ
    if (totalRemoved === 0) {
        console.log("[coverage:cleanup] no old coverage files found to delete");
    } else {
        console.log(`[coverage:cleanup] total: ${totalRemoved} file(s) removed`);
    }

    // 常に成功ステータスで終了
    process.exit(0);
}

main();
