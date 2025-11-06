import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { getLogger } from "./logger";

const logger = getLogger();

// Firebase設定の検証
function validateFirebaseConfig() {
    const requiredEnvVars = [
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_STORAGE_BUCKET",
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        "VITE_FIREBASE_APP_ID",
    ];

    const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);

    if (missingVars.length > 0) {
        const errorMessage = `Missing required Firebase environment variables: ${missingVars.join(", ")}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }
}

// Firebase設定
function getFirebaseConfig() {
    validateFirebaseConfig();

    return {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    };
}

// グローバルキャッシュ（HMR・SSR対応）
const globalKey = "__firebase_client_app__";
const globalRef = globalThis as typeof globalThis & {
    [globalKey]?: FirebaseApp;
};

/**
 * グローバルなFirebaseアプリインスタンスを取得または初期化する
 * SSR環境での重複初期化を防ぐための中央管理機能
 *
 * 実装指針：
 * 1. globalThis キャッシュでHMR・SSR対応
 * 2. getApps() で既存インスタンス確認
 * 3. 重複エラー時の安全なフォールバック
 */
export function getFirebaseApp(): FirebaseApp {
    // 1段目: globalThis キャッシュ（HMR・SSR対策）
    if (globalRef[globalKey]) {
        logger.debug("Firebase app: Using globalThis cached instance");
        return globalRef[globalKey]!;
    }

    // 2段目: Firebase SDK内部キャッシュ
    const existingApps = getApps();
    if (existingApps.length > 0) {
        const app = getApp();
        globalRef[globalKey] = app;
        logger.info("Firebase app: Using existing SDK instance");
        return app;
    }

    try {
        // 新しいアプリを初期化
        const firebaseConfig = getFirebaseConfig();
        const app = initializeApp(firebaseConfig);
        globalRef[globalKey] = app;
        logger.info("Firebase app: Initialized new instance");
        return app;
    } catch (error: unknown) {
        logger.error({ error }, "Firebase app initialization error");

        // 重複アプリエラーの場合は既存のアプリを使用
        if (
            error && typeof error === "object" && "code" in error
                && (error as { code?: string; }).code === "app/duplicate-app"
            || error && typeof error === "object" && "message" in error
                && (error as { message?: string; }).message?.includes("already exists")
        ) {
            logger.info("Firebase app: Duplicate app error, attempting recovery");
            const existingApps = getApps();
            if (existingApps.length > 0) {
                const app = getApp();
                globalRef[globalKey] = app;
                logger.info("Firebase app: Successfully recovered from duplicate error");
                return app;
            }
        }

        throw error;
    }
}

/**
 * Firebaseアプリインスタンスをリセットする（テスト用）
 */
export function resetFirebaseApp(): void {
    globalRef[globalKey] = undefined;
}
