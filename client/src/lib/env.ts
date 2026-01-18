// dotenvを直接importしてテスト時に.env.testを読み込めるようにする
import { log } from "./logger"; // ロガーをインポート

/**
 * 環境変数を取得する関数
 * @param key 環境変数のキー
 * @param defaultValue デフォルト値
 * @returns 環境変数の値、または未定義の場合はデフォルト値
 */
export function getEnv(key: string, defaultValue: string = ""): string {
    // 実行環境の検出 - VITE_IS_TEST is not available in client runtime for security
    const isTestEnv = (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test")
        || (typeof process !== "undefined" && process.env?.NODE_ENV === "test")
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        || (typeof window !== "undefined" && (window as any).__E2E__ === true);

    // テスト環境専用の処理
    if (isTestEnv) {
        // テスト関連のログ出力
        if (key === "VITE_USE_TINYLICIOUS" || key === "VITE_FORCE_AZURE") {
            log("env", "debug", `Test environment detected, checking value for ${key}`);
        }

        // 環境変数から直接値を取得
        const envValue = typeof import.meta !== "undefined" && import.meta.env?.[key];
        if (envValue !== undefined) {
            log("env", "debug", `Using value for ${key}: ${envValue}`);
            return envValue as string;
        }

        // テスト環境のデフォルト値
        if (key === "VITE_USE_TINYLICIOUS") return "true";
        if (key === "VITE_FORCE_AZURE") return "false";
    }

    return (typeof import.meta !== "undefined" && import.meta.env?.[key]) || defaultValue;
}

/**
 * デバッグ用の環境設定を取得する関数
 */
export function getDebugConfig() {
    return {
        isDevelopment: (typeof import.meta !== "undefined" && import.meta.env?.DEV) || false,
        isTest: (typeof import.meta !== "undefined" && import.meta.env?.VITE_IS_TEST) || false,
        host: typeof window !== "undefined" ? window.location.host : "server-side",
        nodeEnv: (typeof import.meta !== "undefined" && import.meta.env?.MODE) || "unknown",
    };
}
