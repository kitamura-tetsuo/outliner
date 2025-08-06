#!/usr/bin/env node

/**
 * 本番環境データ全削除スクリプト
 *
 * 使用方法:
 * node scripts/delete-production-data.js --confirm
 *
 * 注意: このスクリプトは本番環境のすべてのデータを削除します。
 * 実行前に必ずバックアップを取得してください。
 */

const https = require("https");
const readline = require("readline");

// 設定
const PRODUCTION_URL = "https://us-central1-outliner-d57b0.cloudfunctions.net/deleteAllProductionData";
const ADMIN_TOKEN = "ADMIN_DELETE_ALL_DATA_2024";
const CONFIRMATION_CODE = "DELETE_ALL_PRODUCTION_DATA_CONFIRM";

// コマンドライン引数の解析
const args = process.argv.slice(2);
const confirmFlag = args.includes("--confirm");
const forceFlag = args.includes("--force");

// 色付きログ出力
const colors = {
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    reset: "\x1b[0m",
};

function log(message, color = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// HTTPSリクエストを送信する関数
function makeRequest(data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);

        const options = {
            hostname: "us-central1-outliner-d57b0.cloudfunctions.net",
            path: "/deleteAllProductionData",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let responseData = "";

            res.on("data", (chunk) => {
                responseData += chunk;
            });

            res.on("end", () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve({ statusCode: res.statusCode, data: parsedData });
                } catch (error) {
                    resolve({ statusCode: res.statusCode, data: responseData });
                }
            });
        });

        req.on("error", (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// ユーザー確認を求める関数
function askConfirmation(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
        });
    });
}

// メイン処理
async function main() {
    log("=".repeat(80), "red");
    log("本番環境データ全削除スクリプト", "red");
    log("=".repeat(80), "red");
    log("");

    log("⚠️  警告: このスクリプトは本番環境のすべてのデータを削除します！", "yellow");
    log("   - Firebase Firestore のすべてのコレクション", "yellow");
    log("   - Firebase Auth のすべてのユーザー", "yellow");
    log("   - Firebase Storage のすべてのファイル", "yellow");
    log("");

    // 確認フラグのチェック
    if (!confirmFlag) {
        log("エラー: --confirm フラグが必要です", "red");
        log("使用方法: node scripts/delete-production-data.js --confirm", "blue");
        process.exit(1);
    }

    // 強制実行フラグがない場合は追加確認
    if (!forceFlag) {
        log("本当に本番環境のすべてのデータを削除しますか？", "red");
        log("この操作は取り消すことができません。", "red");
        log("");

        const confirmed = await askConfirmation('続行するには "yes" と入力してください: ');

        if (!confirmed) {
            log("操作がキャンセルされました。", "green");
            process.exit(0);
        }
    }

    log("");
    log("本番環境データ削除を開始します...", "yellow");
    log("");

    try {
        // API呼び出し
        const response = await makeRequest({
            adminToken: ADMIN_TOKEN,
            confirmationCode: CONFIRMATION_CODE,
        });

        if (response.statusCode === 200) {
            log("✅ データ削除が正常に完了しました", "green");
            log("");

            if (response.data && response.data.results) {
                const results = response.data.results;

                // Firestore結果
                log("📊 削除結果:", "blue");
                log(
                    `Firestore: ${results.firestore.success ? "成功" : "失敗"}`,
                    results.firestore.success ? "green" : "red",
                );

                if (results.firestore.deletedCollections) {
                    results.firestore.deletedCollections.forEach(col => {
                        log(`  - ${col.name}: ${col.count}件のドキュメントを削除`, "blue");
                    });
                }

                if (results.firestore.error) {
                    log(`  エラー: ${results.firestore.error}`, "red");
                }

                // Firebase Auth結果
                log(`Firebase Auth: ${results.auth.success ? "成功" : "失敗"}`, results.auth.success ? "green" : "red");
                log(`  - ${results.auth.deletedUsers}人のユーザーを削除`, "blue");

                if (results.auth.error) {
                    log(`  エラー: ${results.auth.error}`, "red");
                }

                // Firebase Storage結果
                log(
                    `Firebase Storage: ${results.storage.success ? "成功" : "失敗"}`,
                    results.storage.success ? "green" : "red",
                );
                log(`  - ${results.storage.deletedFiles}個のファイルを削除`, "blue");

                if (results.storage.error) {
                    log(`  エラー: ${results.storage.error}`, "red");
                }
            }

            log("");
            log(`実行時刻: ${response.data.timestamp || new Date().toISOString()}`, "blue");
        } else {
            log(`❌ データ削除に失敗しました (HTTP ${response.statusCode})`, "red");
            log(`エラー: ${JSON.stringify(response.data, null, 2)}`, "red");
            process.exit(1);
        }
    } catch (error) {
        log(`❌ リクエストエラー: ${error.message}`, "red");
        process.exit(1);
    }
}

// スクリプト実行
if (require.main === module) {
    main().catch(error => {
        log(`❌ 予期しないエラー: ${error.message}`, "red");
        process.exit(1);
    });
}

module.exports = { makeRequest, ADMIN_TOKEN, CONFIRMATION_CODE };
