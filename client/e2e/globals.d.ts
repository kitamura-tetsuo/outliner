interface Window {
    mockFluidClient?: boolean;
    alert: (message: string) => void;
    mockUser?: {
        id: string;
        name: string;
        email?: string;
        photoURL?: string;
    };
    mockFluidToken?: {
        token: string;
        user: {
            id: string;
            name: string;
        };
        tenantId?: string;
        containerId?: string;
    };
    _alertMessage?: string | null;
    mockContainerConnected?: boolean;
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

            // Firebase エミュレーターを有効化
            window.localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");

            // エミュレーター接続情報（環境変数から取得、デフォルトはlocalhost）
            window.localStorage.setItem(
                "VITE_FIRESTORE_EMULATOR_HOST",
                process.env.VITE_FIRESTORE_EMULATOR_HOST || "localhost:58080",
            );
            window.localStorage.setItem(
                "VITE_AUTH_EMULATOR_HOST",
                process.env.VITE_AUTH_EMULATOR_HOST || "localhost:59099",
            );

            // Tinylicious設定（必要に応じて）
            window.localStorage.setItem("VITE_USE_TINYLICIOUS", "true");

            // 認証済み状態をシミュレート

            // テスト用のユーザーデータ
            window.mockUser = {
                id: "test-user-id",
                name: "Test User",
                email: "test@example.com",
            };

            // テスト用のFluidトークン
            window.mockFluidToken = {
                token: "mock-jwt-token",
                user: {
                    id: "test-user-id",
                    name: "Test User",
                },
            };

            // ページがロードされたときにコンテナのステータスをモック
            window.addEventListener("DOMContentLoaded", () => {
                window.mockContainerConnected = true;
            });
        });

        await use(page);
    },
});
