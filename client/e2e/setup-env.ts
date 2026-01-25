// このファイルはテスト実行前にロードされ、環境変数を設定します
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Svelte 5 runes shim for E2E tests
// When running E2E tests, Svelte 5 runes are not available at module load time.
// This shim provides a minimal fallback that allows the stores to initialize.
if (typeof (globalThis as any).$state === "undefined") {
    (globalThis as any).$state = function<T>(value: T): T {
        return value;
    };
    (globalThis as any).$derived = function<T>(value: T): T {
        return value;
    };
    (globalThis as any).$effect = function(): void {
        // No-op for E2E tests
    };
    (globalThis as any).$props = function(): any {
        return {};
    };
    (globalThis as any).$bindable = function<T>(value?: T): any {
        return value;
    };
    (globalThis as any).$inspect = function<T>(value: T): T {
        return value;
    };
}

if (!process.env.CI) {
    // ES Modulesで__dirnameの代わりに現在のファイルのディレクトリを取得
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // 環境変数に応じて適切な.envファイルを選択
    const isLocalhostEnv = process.env.TEST_ENV === "localhost";
    const envFileName = isLocalhostEnv ? ".env.localhost.test" : ".env.test";
    const envFilePath = path.join(__dirname, "..", envFileName);

    console.log(`Using test environment: ${isLocalhostEnv ? "localhost" : "default"}`);
    console.log(`Loading environment from: ${envFilePath}`);

    // Check if file exists
    if (fs.existsSync(envFilePath)) {
        console.log(`Loading test environment from: ${envFilePath}`);
        // Load environment variables
        const result = dotenv.config({ path: envFilePath, override: true });

        if (result.error) {
            console.error(`Error loading ${envFileName} file:`, result.error);
        } else {
            console.log(`Successfully loaded test environment variables from ${envFileName}`);
        }
    } else {
        console.warn(`${envFileName} file not found at: ${envFilePath}`);
    }
}

// Setup environment variables for E2E tests
export function setupEnv() {
    // Environment variables are loaded from .env.test
    // Only additional environment variable operations or test-specific settings are performed here

    // Check critical variables to ensure they can be used in localStorage
    const requiredVars = [
        "VITE_IS_TEST",
        "VITE_USE_FIREBASE_EMULATOR",
        "VITE_FIREBASE_EMULATOR_HOST",
        "VITE_USE_TINYLICIOUS",
    ];

    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            console.warn(`Required test environment variable ${varName} is not set`);
        }
    }

    console.log("Test environment setup completed");
}
