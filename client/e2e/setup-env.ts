// このファイルはテスト実行前にロードされ、環境変数を設定します
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

// .env.testファイルの内容を更新
const envTestContent = `
# テスト用にポートを変更（開発環境と被らないようにする）
VITE_PORT=7080

# テスト環境用の設定
VITE_IS_TEST=true
VITE_IS_TEST_MODE_FORCE_E2E=true

# Tinylicious関連設定
VITE_USE_TINYLICIOUS=true
VITE_FORCE_AZURE=false
VITE_TINYLICIOUS_HOST=localhost
VITE_TINYLICIOUS_PORT=7082
VITE_TINYLICIOUS_ENDPOINT=http://localhost:7082

# Firebase Emulator関連設定
VITE_USE_FIREBASE_EMULATOR=true
VITE_FIRESTORE_EMULATOR_HOST=192.168.50.16
VITE_FIRESTORE_EMULATOR_PORT=6480
VITE_AUTH_EMULATOR_HOST=192.168.50.16
VITE_AUTH_EMULATOR_PORT=9099
VITE_FIREBASE_EMULATOR_UI_PORT=6400

# API関連設定
VITE_API_BASE_URL=http://localhost:7081

# Firebase関連設定（テスト用）
VITE_FIREBASE_API_KEY=test-api-key
VITE_FIREBASE_AUTH_DOMAIN=test-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=test-project-id
VITE_FIREBASE_STORAGE_BUCKET=test-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000

# テスト用ユーザー
VITE_DEBUG_USER_ID=test-user-id
VITE_DEBUG_USER_NAME=Test User
VITE_DEBUG_USER_EMAIL=test@example.com
`;

// .env.testファイルを作成または更新
fs.writeFileSync(envTestPath, envTestContent.trim());
console.log(".env.test file has been updated");
