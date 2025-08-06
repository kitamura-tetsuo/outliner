#!/usr/bin/env node

/**
 * 本番環境チェックスクリプト
 *
 * 使用方法:
 * node scripts/check-production-environment.js
 *
 * このスクリプトは現在の環境が本番環境かどうかをチェックします。
 */

const https = require("https");

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

// 本番環境のヘルスチェック
function checkProductionHealth() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "us-central1-outliner-d57b0.cloudfunctions.net",
            path: "/health",
            method: "GET",
            timeout: 10000,
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

        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });

        req.end();
    });
}

// Firebase プロジェクト情報の確認
function checkFirebaseProject() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "outliner-d57b0.web.app",
            path: "/",
            method: "GET",
            timeout: 10000,
        };

        const req = https.request(options, (res) => {
            resolve({ statusCode: res.statusCode, headers: res.headers });
        });

        req.on("error", (error) => {
            reject(error);
        });

        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });

        req.end();
    });
}

// 環境変数のチェック
function checkEnvironmentVariables() {
    const requiredEnvVars = [
        "NODE_ENV",
        "FIREBASE_PROJECT_ID",
    ];

    const envStatus = {};

    requiredEnvVars.forEach(varName => {
        envStatus[varName] = {
            exists: !!process.env[varName],
            value: process.env[varName] || "undefined",
        };
    });

    return envStatus;
}

// エミュレーター環境の検出
function detectEmulatorEnvironment() {
    const emulatorVars = [
        "FUNCTIONS_EMULATOR",
        "FIRESTORE_EMULATOR_HOST",
        "FIREBASE_AUTH_EMULATOR_HOST",
        "FIREBASE_STORAGE_EMULATOR_HOST",
    ];

    const emulatorStatus = {};
    let hasEmulator = false;

    emulatorVars.forEach(varName => {
        const exists = !!process.env[varName];
        emulatorStatus[varName] = {
            exists,
            value: process.env[varName] || "undefined",
        };
        if (exists) hasEmulator = true;
    });

    return { hasEmulator, emulatorStatus };
}

// メイン処理
async function main() {
    log("=".repeat(60), "blue");
    log("本番環境チェックスクリプト", "blue");
    log("=".repeat(60), "blue");
    log("");

    // 環境変数のチェック
    log("🔍 環境変数チェック:", "blue");
    const envVars = checkEnvironmentVariables();

    Object.entries(envVars).forEach(([key, info]) => {
        const status = info.exists ? "✅" : "❌";
        const color = info.exists ? "green" : "red";
        log(`  ${status} ${key}: ${info.value}`, color);
    });
    log("");

    // エミュレーター環境の検出
    log("🔍 エミュレーター環境チェック:", "blue");
    const emulatorInfo = detectEmulatorEnvironment();

    if (emulatorInfo.hasEmulator) {
        log("  ⚠️  エミュレーター環境が検出されました", "yellow");
        Object.entries(emulatorInfo.emulatorStatus).forEach(([key, info]) => {
            if (info.exists) {
                log(`    - ${key}: ${info.value}`, "yellow");
            }
        });
    } else {
        log("  ✅ エミュレーター環境は検出されませんでした", "green");
    }
    log("");

    // 本番環境判定
    const isProduction = process.env.NODE_ENV === "production" && !emulatorInfo.hasEmulator;
    log("🎯 環境判定:", "blue");
    log(`  現在の環境: ${isProduction ? "本番環境" : "開発/テスト環境"}`, isProduction ? "red" : "green");
    log("");

    // 本番環境の場合は追加チェック
    if (isProduction) {
        log("🌐 本番環境接続チェック:", "blue");

        try {
            // Firebase Functions ヘルスチェック
            log("  Firebase Functions をチェック中...", "yellow");
            const healthResponse = await checkProductionHealth();

            if (healthResponse.statusCode === 200) {
                log("  ✅ Firebase Functions: 正常", "green");
                if (healthResponse.data && healthResponse.data.status) {
                    log(`    - ステータス: ${healthResponse.data.status}`, "blue");
                    log(`    - タイムスタンプ: ${healthResponse.data.timestamp}`, "blue");
                }
            } else {
                log(`  ❌ Firebase Functions: エラー (HTTP ${healthResponse.statusCode})`, "red");
            }
        } catch (error) {
            log(`  ❌ Firebase Functions: 接続エラー - ${error.message}`, "red");
        }

        try {
            // Firebase Hosting チェック
            log("  Firebase Hosting をチェック中...", "yellow");
            const hostingResponse = await checkFirebaseProject();

            if (hostingResponse.statusCode === 200) {
                log("  ✅ Firebase Hosting: 正常", "green");
            } else {
                log(`  ❌ Firebase Hosting: エラー (HTTP ${hostingResponse.statusCode})`, "red");
            }
        } catch (error) {
            log(`  ❌ Firebase Hosting: 接続エラー - ${error.message}`, "red");
        }

        log("");
        log("⚠️  警告: 本番環境が検出されました", "red");
        log("   データ削除操作を実行する前に、必ずバックアップを取得してください。", "red");
        log("   バックアップコマンド: node scripts/backup-production-data.js", "yellow");
    } else {
        log("ℹ️  現在は開発/テスト環境です", "blue");
        log("   本番環境でのデータ削除操作は実行されません。", "blue");
    }

    log("");
    log("チェック完了", "green");

    // 終了コード（本番環境の場合は1、それ以外は0）
    process.exit(isProduction ? 1 : 0);
}

// スクリプト実行
if (require.main === module) {
    main().catch(error => {
        log(`❌ 予期しないエラー: ${error.message}`, "red");
        process.exit(1);
    });
}

module.exports = { main, checkProductionHealth, detectEmulatorEnvironment };
