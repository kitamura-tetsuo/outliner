/**
 * Firebase Functions URLヘルパー
 * 環境に応じて適切なFirebase Functions URLを生成する
 */

import { getEnv } from "./env";

/**
 * 環境に応じてFirebase Functions URLを変換する
 * @param functionName - 呼び出すFunction名
 * @returns 適切なURL
 */
export function getFirebaseFunctionUrl(functionName: string): string {
    const apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57070");
    const isTest = getEnv("VITE_IS_TEST", "false") === "true";

    // テスト環境ではFirebase Hostingエミュレーター経由でアクセス
    if (isTest) {
        // Use relative path in browser to stay on the same origin (avoid CORS issues)
        if (typeof window !== "undefined") {
            return `/api/${functionName}`;
        }
        // Use absolute URL for node/unit test environments
        return `http://localhost:57000/api/${functionName}`;
    }

    // Firebase Hostingエミュレーター（localhost:57000）の場合
    if (apiBaseUrl === "http://localhost:57000") {
        // Firebase Hostingエミュレーターのrewritesルール経由でアクセス
        return `${apiBaseUrl}/api/${functionName}`;
    }

    // ローカル開発環境（Firebase Functionsエミュレーター直接）の場合
    if (apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1")) {
        // エミュレーターでは /outliner-d57b0/us-central1/ プレフィックスが必要
        return `${apiBaseUrl}/outliner-d57b0/us-central1/${functionName}`;
    }

    // プロダクション環境の場合
    // Firebase Hostingのrewritesルールにより、/api/function名 でアクセス可能
    return `${apiBaseUrl}/api/${functionName}`;
}

/**
 * SvelteKit APIプロキシ経由でアクセスする場合のURL
 * @param apiPath - APIパス（例: 'azure-health-check'）
 * @returns SvelteKit APIプロキシのURL
 */
export function getSvelteKitApiUrl(apiPath: string): string {
    // SvelteKit APIプロキシは常に /api/ プレフィックスを使用
    return `/api/${apiPath}`;
}

/**
 * 環境判定ヘルパー
 */
export function isLocalDevelopment(): boolean {
    const apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57070");
    const isTest = getEnv("VITE_IS_TEST", "false") === "true";

    // テスト環境では常にfalseを返す（プロダクション環境として扱う）
    if (isTest) {
        return false;
    }

    return apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1");
}

/**
 * デバッグ用：現在の設定を表示
 */
export function debugFirebaseFunctionsConfig(): void {
    const apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57070");
    const isTest = getEnv("VITE_IS_TEST", "false") === "true";
    console.log("Firebase Functions URL Config:", {
        apiBaseUrl,
        isTest,
        isLocal: isLocalDevelopment(),
        exampleUrl: getFirebaseFunctionUrl("getUserContainers"),
    });
}
