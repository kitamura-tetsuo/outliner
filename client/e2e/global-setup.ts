import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { setupEnv } from "./setup-env";

// ESモジュールで__dirnameを使うための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数のセットアップ
setupEnv();

// Tinyliciousサーバーのインスタンスを格納する変数
let tinyliciousProcess = null;

// Tinyliciousサーバーを起動する関数
function startTinyliciousServer() {
    const tinyliciousPort = process.env.VITE_TINYLICIOUS_PORT || "7082";
    console.log(`Starting Tinylicious server on port ${tinyliciousPort}...`);

    // プロセス起動前にログディレクトリを確認して作成
    const logDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // ログファイルのパス
    const logFile = path.join(logDir, "tinylicious-server.log");
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    // Tinyliciousサーバーを起動
    const serverProcess = spawn("npx", ["tinylicious", "--port", tinyliciousPort], {
        env: { ...process.env, PORT: tinyliciousPort },
        stdio: ["ignore", "pipe", "pipe"],
    });

    // 標準出力と標準エラー出力をログファイルに記録
    serverProcess.stdout.pipe(logStream);
    serverProcess.stderr.pipe(logStream);

    // ログにタイムスタンプを追加
    logStream.write(`\n--- Tinylicious server started at ${new Date().toISOString()} ---\n`);

    // エラーハンドリング
    serverProcess.on("error", err => {
        console.error("Failed to start Tinylicious server:", err);
        logStream.write(`Error starting server: ${err.message}\n`);
    });

    return serverProcess;
}

async function globalSetup() {
    console.log("Starting global setup...");

    // Tinyliciousサーバーを起動
    try {
        tinyliciousProcess = startTinyliciousServer();
        // サーバーが起動するまで少し待機
        await new Promise(resolve => setTimeout(resolve, 5000));

        global.__TINYLICIOUS_PROCESS__ = tinyliciousProcess;
    }
    catch (err) {
        console.error("Failed to start Tinylicious server:", err);
    }

    // ブラウザインスタンスを作成
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
        // Firebase Emulatorの起動確認（オプション）
        // エミュレータが既に起動済みであることを前提としています
        console.log("Testing Firebase Emulator connection...");
        if (process.env.VITE_USE_FIREBASE_EMULATOR === "true") {
            const emulatorHost = process.env.VITE_FIRESTORE_EMULATOR_HOST || "firebase-emulator";
            const emulatorUiPort = process.env.VITE_FIREBASE_EMULATOR_UI_PORT || "4000";

            try {
                // Emulator UI が応答するか確認
                await page.goto(`http://${emulatorHost}:${emulatorUiPort}`, { timeout: 5000 });
                console.log("Firebase Emulator UI is accessible");
            }
            catch (err) {
                console.warn(`Firebase Emulator UI check failed: ${err.message}`);
                console.warn("Tests may still work if emulator is running but UI is not accessible");
            }
        }

        // Tinylicious サーバーの起動確認
        console.log("Testing Tinylicious server connection...");

        // 環境変数からTinyliciousエンドポイントを取得
        const tinyliciousHost = process.env.VITE_TINYLICIOUS_HOST || "localhost";
        const tinyliciousPort = process.env.VITE_TINYLICIOUS_PORT || "7082";
        const tinyliciousEndpoint = `http://${tinyliciousHost}:${tinyliciousPort}`;

        try {
            // Tinylicious が応答するか確認
            await page.goto(tinyliciousEndpoint, { timeout: 5000 });
            console.log("Tinylicious server is accessible");
        }
        catch (err) {
            console.warn(`Tinylicious server check failed: ${err.message}`);
            console.warn("Tests may fail if Tinylicious server is not running");
        }

        // localStorage設定はスキップ - SecurityErrorの原因になるため
        console.log("Skipping localStorage initialization to avoid SecurityError");
    }
    catch (err) {
        console.error("Global setup failed:", err);
    }
    finally {
        await browser.close();
        console.log("Global setup completed");
    }
}

export default globalSetup;
