/**
 * エミュレータ用のFirebase設定を動的に生成するスクリプト
 * 本番環境では静的ファイル配信、エミュレータ環境ではlocalhost:7090にリダイレクト
 */

const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "..", "firebase.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// エミュレータ用の設定に変更
const emulatorConfig = { ...config };

// プロジェクトIDを明示的に設定
emulatorConfig.projectId = process.env.FIREBASE_PROJECT_ID || "outliner-d57b0";

const rewriteRules = emulatorConfig.hosting.rewrites;

// 最後のルール（**）をlocalhost:7090にリダイレクトするように変更
const lastRule = rewriteRules[rewriteRules.length - 1];
if (lastRule && lastRule.source === "**") {
    lastRule.destination = "http://localhost:7090";
}

// 一時的なエミュレータ用設定ファイルを作成
const emulatorConfigPath = path.join(__dirname, "..", "firebase.emulator.json");
fs.writeFileSync(emulatorConfigPath, JSON.stringify(emulatorConfig, null, 4));

console.log("エミュレータ用のFirebase設定を生成しました: firebase.emulator.json");
