interface Window {
    alert: (message: string) => void;
    mockUser?: {
        id: string;
        name: string;
        email?: string;
        photoURL?: string;
    };
    _alertMessage?: string | null;
}

declare namespace jest {
    function fn(): () => void;
}

// テスト環境のグローバル定義
declare namespace NodeJS {
    interface Global {
        isTestEnvironment: boolean;
    }
}

import { test as base } from "@playwright/test";
import { setupEnv } from "./setup-env";

// テスト用の環境変数を設定
setupEnv();

/**
 * E2Eテスト用の拡張テストフィクスチャを定義
 * Firebase Emulatorへの接続設定を含む
 */
export const test = base.extend({
    page: async ({ page }, use) => {
        // Firebase エミュレーターの接続情報を設定
        await page.addInitScript(() => {
            // テスト環境フラグをセット
            window.localStorage.setItem("VITE_IS_TEST", "true");
            window.localStorage.setItem("VITE_IS_TEST_MODE_FORCE_E2E", "true");

            // Firebase エミュレーターを有効化
            window.localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");

            // エミュレーター接続情報（環境変数から取得、デフォルトはlocalhost）
            window.localStorage.setItem(
                "VITE_FIREBASE_EMULATOR_HOST",
                process.env.VITE_FIREBASE_EMULATOR_HOST || "localhost",
            );
            window.localStorage.setItem(
                "VITE_FIRESTORE_EMULATOR_PORT",
                process.env.VITE_FIRESTORE_EMULATOR_PORT || "58080",
            );
            window.localStorage.setItem(
                "VITE_AUTH_EMULATOR_PORT",
                process.env.VITE_AUTH_EMULATOR_PORT || "59099",
            );

            // 認証済み状態をシミュレート
            // テスト用のユーザーデータ
            window.mockUser = {
                id: "test-user-id",
                name: "Test User",
                email: "test@example.com",
            };

            // Define environment variables that the test is looking for
            if (typeof window !== "undefined") {
                const globalObj = window as any;

                // Set up the exact property name that the test is looking for
                if (!globalObj["import.meta.env"]) {
                    globalObj["import.meta.env"] = {
                        VITE_IS_TEST: "true",
                        VITE_IS_TEST_MODE_FORCE_E2E: "true",
                        VITE_USE_FIREBASE_EMULATOR: "true",
                        VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || "localhost",
                        VITE_FIRESTORE_EMULATOR_PORT: process.env.VITE_FIRESTORE_EMULATOR_PORT || "58080",
                        VITE_AUTH_EMULATOR_PORT: process.env.VITE_AUTH_EMULATOR_PORT || "59099",
                    };
                }

                // Also ensure the VITE_IS_TEST is available as a direct property on window
                if (!globalObj.VITE_IS_TEST) {
                    globalObj.VITE_IS_TEST = "true";
                }

                // Also make sure the proper import.meta.env is available
                if (!globalObj.import) {
                    globalObj.import = {};
                }
                if (!globalObj.import.meta) {
                    globalObj.import.meta = { env: {} };
                }

                // Set the values if they don't exist
                globalObj.import.meta.env = {
                    ...globalObj.import.meta.env,
                    VITE_IS_TEST: "true",
                    VITE_IS_TEST_MODE_FORCE_E2E: "true",
                    VITE_USE_FIREBASE_EMULATOR: "true",
                    VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || "localhost",
                    VITE_FIRESTORE_EMULATOR_PORT: process.env.VITE_FIRESTORE_EMULATOR_PORT || "58080",
                    VITE_AUTH_EMULATOR_PORT: process.env.VITE_AUTH_EMULATOR_PORT || "59099",
                };

                // Create a function to ensure environment variables are available
                // even after app initialization
                globalObj.ensureEnvVars = function() {
                    if (!globalObj["import.meta.env"]) {
                        globalObj["import.meta.env"] = {
                            VITE_IS_TEST: "true",
                            VITE_IS_TEST_MODE_FORCE_E2E: "true",
                            VITE_USE_FIREBASE_EMULATOR: "true",
                            VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || "localhost",
                            VITE_FIRESTORE_EMULATOR_PORT: process.env.VITE_FIRESTORE_EMULATOR_PORT || "58080",
                            VITE_AUTH_EMULATOR_PORT: process.env.VITE_AUTH_EMULATOR_PORT || "59099",
                        };
                    }
                    if (!globalObj.VITE_IS_TEST) {
                        globalObj.VITE_IS_TEST = "true";
                    }
                    if (!globalObj.import) globalObj.import = {};
                    if (!globalObj.import.meta) globalObj.import.meta = { env: {} };
                    globalObj.import.meta.env = {
                        ...globalObj.import.meta.env,
                        VITE_IS_TEST: "true",
                        VITE_IS_TEST_MODE_FORCE_E2E: "true",
                        VITE_USE_FIREBASE_EMULATOR: "true",
                        VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || "localhost",
                        VITE_FIRESTORE_EMULATOR_PORT: process.env.VITE_FIRESTORE_EMULATOR_PORT || "58080",
                        VITE_AUTH_EMULATOR_PORT: process.env.VITE_AUTH_EMULATOR_PORT || "59099",
                    };
                };

                // Ensure env vars are set now
                globalObj.ensureEnvVars();
            }
        });

        await use(page);
    },
});
