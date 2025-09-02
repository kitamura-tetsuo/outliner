#!/usr/bin/env node

// テスト用のYjsサーバー起動スクリプト
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// テスト用の環境変数を設定
const testEnv = {
    ...process.env,
    NODE_ENV: "test",
    PORT: "1234",
    HOST: "0.0.0.0",
    LOG_LEVEL: "info",
    YPERSISTENCE: "./test-yjs-data",
    // テスト用のFirebase認証設定（実際の値は環境変数から取得）
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "test-project",
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || "test-key",
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || "test@test.com",
};

console.log("Starting Yjs test server...");
console.log(`Port: ${testEnv.PORT}`);
console.log(`Host: ${testEnv.HOST}`);
console.log(`Persistence: ${testEnv.YPERSISTENCE}`);

// サーバーを起動
const serverProcess = spawn("node", ["server.js"], {
    cwd: __dirname,
    env: testEnv,
    stdio: "inherit",
});

// プロセス終了時の処理
process.on("SIGINT", () => {
    console.log("\nShutting down Yjs test server...");
    serverProcess.kill("SIGINT");
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\nShutting down Yjs test server...");
    serverProcess.kill("SIGTERM");
    process.exit(0);
});

serverProcess.on("close", (code) => {
    console.log(`Yjs test server exited with code ${code}`);
    process.exit(code);
});

serverProcess.on("error", (error) => {
    console.error("Failed to start Yjs test server:", error);
    process.exit(1);
});
