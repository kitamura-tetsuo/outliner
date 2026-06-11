import { spawn, type ChildProcess } from "child_process";
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
let tinyliciousProcess: ChildProcess | null = null;
let serverProcess: ChildProcess | null = null;

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
    }
    catch (e) {
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

    global.__TINYLICIOUS_PROCESS__ = tinyliciousProcess;
    global.__SERVER_PROCESS__ = serverProcess;

    // give servers time to start
    await new Promise(r => setTimeout(r, 5000));
}

export default globalSetup;
