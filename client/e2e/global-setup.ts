// @ts-nocheck
import { type ChildProcess, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { setupEnv } from "./setup-env";

// ESモジュールで__dirnameを使うための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数のセットアップ
setupEnv();

// サーバープロセスのインスタンスを格納する変数
let tinyliciousProcess: ChildProcess | null = null;
let serverProcess: ChildProcess | null = null;
let yjsServerProcess: ChildProcess | null = null;

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
    // ログファイルが存在しなければ作成
    if (!fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, "");
    }
    // 権限を777に設定してアクセスエラーを回避
    try {
        fs.chmodSync(logFile, 0o777);
    } catch (e) {
        console.warn(`Failed to chmod log file: ${e.message}`);
    }
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

function startYjsServer() {
    const yjsPort = process.env.YJS_SERVER_PORT || "1234";
    console.log(`Starting Yjs WebSocket server on port ${yjsPort}...`);

    // プロセス起動前にログディレクトリを確認して作成
    const logDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // ログファイルのパス
    const logFile = path.join(logDir, "yjs-server.log");
    // ログファイルが存在しなければ作成
    if (!fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, "");
    }
    // 権限を777に設定してアクセスエラーを回避
    try {
        fs.chmodSync(logFile, 0o777);
    } catch (e) {
        console.warn(`Failed to chmod log file: ${e.message}`);
    }
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    // Yjsサーバーを起動（簡単なテストサーバーを使用）
    const yjsServerPath = path.join(__dirname, "..", "..", "yjs-server");
    const serverProcess = spawn("node", ["simple-test-server.js"], {
        cwd: yjsServerPath,
        env: {
            ...process.env,
            PORT: yjsPort,
            HOST: "0.0.0.0",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });

    // 標準出力と標準エラー出力をログファイルに記録
    serverProcess.stdout.pipe(logStream);
    serverProcess.stderr.pipe(logStream);

    // ログにタイムスタンプを追加
    logStream.write(`\n--- Yjs server started at ${new Date().toISOString()} ---\n`);

    // エラーハンドリング
    serverProcess.on("error", err => {
        console.error("Failed to start Yjs server:", err);
        logStream.write(`Error starting server: ${err.message}\n`);
    });

    return serverProcess;
}

async function globalSetup() {
    console.log("Starting global setup...");
    const env = { ...process.env, NODE_ENV: "test" };

    const serverPort = env.TEST_PORT || "7090";
    serverProcess = spawn("npm", ["run", "dev", "--", "--host", "0.0.0.0", "--port", serverPort], {
        cwd: path.join(__dirname, ".."),
        env,
        stdio: "inherit",
    });

    tinyliciousProcess = startTinyliciousServer();
    yjsServerProcess = startYjsServer();

    global.__TINYLICIOUS_PROCESS__ = tinyliciousProcess;
    global.__SERVER_PROCESS__ = serverProcess;
    global.__YJS_SERVER_PROCESS__ = yjsServerProcess;

    // give servers time to start
    await new Promise(r => setTimeout(r, 5000));
}

export default globalSetup;
