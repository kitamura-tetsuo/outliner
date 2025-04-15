// このファイルはテスト実行前にロードされ、環境変数を設定します
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

if (!process.env.CI) {
    // ES Modulesで__dirnameの代わりに現在のファイルのディレクトリを取得
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // .env.testファイルのパス
    const envTestPath = path.join(__dirname, "..", ".env.test");

    // ファイルが存在するか確認
    if (fs.existsSync(envTestPath)) {
        console.log("Loading test environment from:", envTestPath);
        // 環境変数を読み込む
        const result = dotenv.config({ path: envTestPath, override: true });

        if (result.error) {
            console.error("Error loading .env.test file:", result.error);
        }
        else {
            console.log("Successfully loaded test environment variables");
        }
    }
    else {
        console.warn(".env.test file not found at:", envTestPath);
    }
}

// E2Eテスト用環境変数のセットアップ
export function setupEnv() {
    // .env.testから環境変数が読み込まれています
    // ここでは追加の環境変数操作やテスト固有の設定のみを行います

    // ローカルストレージでも使用できるように、重要な変数を確認
    const requiredVars = [
        "VITE_IS_TEST",
        "VITE_USE_FIREBASE_EMULATOR",
        "VITE_FIRESTORE_EMULATOR_HOST",
        "VITE_USE_TINYLICIOUS",
    ];

    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            console.warn(`Required test environment variable ${varName} is not set`);
        }
    }

    console.log("Test environment setup completed");
}
