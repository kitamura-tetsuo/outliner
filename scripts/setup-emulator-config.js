/**
 * エミュレータ用のFirebase設定を動的に生成するスクリプト
 * 本番環境では静的ファイル配信、エミュレータ環境ではlocalhost:7090にリダイレクト
 */

import fs from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = path.join(__dirname, "..", "firebase.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// エミュレータ用の設定に変更
const emulatorConfig = { ...config };

// プロジェクトIDを明示的に設定
emulatorConfig.projectId = process.env.FIREBASE_PROJECT_ID || "outliner-d57b0";

const rewriteRules = emulatorConfig.hosting.rewrites;

// Catch-all rule should remain a static fallback to index.html for Hosting emulator.
// Do NOT rewrite to external URLs (e.g., http://localhost:7090) as Hosting rewrites
// do not support external destinations and will cause the emulator to fail to start.
// Keeping the original destination from firebase.json ensures the emulator starts
// and API routes ("/api/*") are handled by Functions via rewrites.

// 一時的なエミュレータ用設定ファイルを作成
const emulatorConfigPath = path.join(__dirname, "..", "firebase.emulator.json");
fs.writeFileSync(emulatorConfigPath, JSON.stringify(emulatorConfig, null, 4));

console.log("エミュレータ用のFirebase設定を生成しました: firebase.emulator.json");
