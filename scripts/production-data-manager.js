#!/usr/bin/env node

/**
 * 本番環境データ管理統合スクリプト
 *
 * 使用方法:
 * node scripts/production-data-manager.js [command] [options]
 *
 * コマンド:
 * - check: 環境チェック
 * - backup: データバックアップ
 * - delete: データ削除（要確認）
 * - help: ヘルプ表示
 */

import { spawn } from "child_process";
import path from "path";
<<<<<<< HEAD
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
=======
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
>>>>>>> origin/main

// 色付きログ出力
const colors = {
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    reset: "\x1b[0m",
};

function log(message, color = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 子プロセスを実行する関数
function runScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        const child = spawn("node", [scriptPath, ...args], {
            stdio: "inherit",
            cwd: path.dirname(__dirname),
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(new Error(`Script exited with code ${code}`));
            }
        });

        child.on("error", (error) => {
            reject(error);
        });
    });
}

// ヘルプ表示
function showHelp() {
    log("=".repeat(70), "cyan");
    log("本番環境データ管理統合スクリプト", "cyan");
    log("=".repeat(70), "cyan");
    log("");
    log("使用方法:", "blue");
    log("  node scripts/production-data-manager.js [command] [options]", "yellow");
    log("");
    log("コマンド:", "blue");
    log("  check                    - 現在の環境をチェック", "green");
    log("  backup                   - 本番環境データをバックアップ", "green");
    log("  delete --confirm         - 本番環境データを削除（要確認）", "red");
    log("  delete --confirm --force - 本番環境データを削除（強制実行）", "red");
    log("  help                     - このヘルプを表示", "green");
    log("");
    log("例:", "blue");
    log("  node scripts/production-data-manager.js check", "yellow");
    log("  node scripts/production-data-manager.js backup", "yellow");
    log("  node scripts/production-data-manager.js delete --confirm", "yellow");
    log("");
    log("⚠️  注意事項:", "red");
    log("  - delete コマンドは本番環境のすべてのデータを削除します", "red");
    log("  - 実行前に必ず backup コマンドでバックアップを取得してください", "red");
    log("  - 削除操作は取り消すことができません", "red");
    log("");
}

// 環境チェック実行
async function runCheck() {
    log("🔍 環境チェックを実行しています...", "blue");
    log("");

    try {
        await runScript(path.join(__dirname, "check-production-environment.js"));
        log("");
        log("✅ 環境チェック完了", "green");
    } catch (error) {
        if (error.message.includes("code 1")) {
            log("");
            log("⚠️  本番環境が検出されました", "yellow");
            log("   データ操作を行う場合は十分注意してください", "yellow");
        } else {
            throw error;
        }
    }
}

// バックアップ実行
async function runBackup() {
    log("💾 データバックアップを実行しています...", "blue");
    log("");

    try {
        await runScript(path.join(__dirname, "backup-production-data.js"));
        log("");
        log("✅ バックアップ完了", "green");
    } catch (error) {
        log("");
        log("❌ バックアップに失敗しました", "red");
        throw error;
    }
}

// データ削除実行
async function runDelete(options) {
    log("🗑️  データ削除を実行しています...", "red");
    log("");

    const args = [];
    if (options.confirm) args.push("--confirm");
    if (options.force) args.push("--force");

    try {
        await runScript(path.join(__dirname, "delete-production-data.js"), args);
        log("");
        log("✅ データ削除完了", "green");
    } catch (error) {
        log("");
        log("❌ データ削除に失敗しました", "red");
        throw error;
    }
}

// 完全なワークフロー実行
async function runFullWorkflow(options) {
    log("🚀 完全なデータ削除ワークフローを実行します", "cyan");
    log("");

    try {
        // 1. 環境チェック
        log("ステップ 1/3: 環境チェック", "blue");
        await runCheck();
        log("");

        // 2. バックアップ
        log("ステップ 2/3: データバックアップ", "blue");
        await runBackup();
        log("");

        // 3. データ削除
        log("ステップ 3/3: データ削除", "blue");
        await runDelete(options);
        log("");

        log("🎉 すべての処理が完了しました", "green");
    } catch (error) {
        log("❌ ワークフローが中断されました", "red");
        throw error;
    }
}

// メイン処理
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const options = {
        confirm: args.includes("--confirm"),
        force: args.includes("--force"),
        full: args.includes("--full"),
    };

    try {
        switch (command) {
            case "check":
                await runCheck();
                break;

            case "backup":
                await runBackup();
                break;

            case "delete":
                if (!options.confirm) {
                    log("❌ delete コマンドには --confirm フラグが必要です", "red");
                    log("使用方法: node scripts/production-data-manager.js delete --confirm", "yellow");
                    process.exit(1);
                }

                if (options.full) {
                    await runFullWorkflow(options);
                } else {
                    await runDelete(options);
                }
                break;

            case "full":
                if (!options.confirm) {
                    log("❌ full コマンドには --confirm フラグが必要です", "red");
                    log("使用方法: node scripts/production-data-manager.js full --confirm", "yellow");
                    process.exit(1);
                }
                await runFullWorkflow(options);
                break;

            case "help":
            case "--help":
            case "-h":
                showHelp();
                break;

            default:
                if (!command) {
                    showHelp();
                } else {
                    log(`❌ 不明なコマンド: ${command}`, "red");
                    log("");
                    showHelp();
                    process.exit(1);
                }
                break;
        }
    } catch (error) {
        log(`❌ エラーが発生しました: ${error.message}`, "red");
        process.exit(1);
    }
}

// スクリプト実行
<<<<<<< HEAD
if (import.meta.url === `file://${process.argv[1]}`) {
=======
const isMainModule = process.argv[1] && new URL(process.argv[1], "file://").pathname === __filename;

if (isMainModule) {
>>>>>>> origin/main
    main().catch(error => {
        log(`❌ 予期しないエラー: ${error.message}`, "red");
        process.exit(1);
    });
}

export { main, runBackup, runCheck, runDelete };
