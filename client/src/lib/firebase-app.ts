import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { getLogger } from "./logger";

const logger = getLogger();

// Validate Firebase configuration
function validateFirebaseConfig() {
    const requiredEnvVars = [
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_STORAGE_BUCKET",
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        "VITE_FIREBASE_APP_ID",
    ];

    const metaEnv = ((typeof import.meta !== "undefined" && import.meta.env) || {}) as any;
    const missingVars = requiredEnvVars.filter(varName => !metaEnv[varName]);

    if (missingVars.length > 0) {
        const errorMessage = `Missing required Firebase environment variables: ${missingVars.join(", ")}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }
}

// Firebase configuration
function getFirebaseConfig() {
    validateFirebaseConfig();

    const metaEnv = ((typeof import.meta !== "undefined" && import.meta.env) || {}) as any;

    const getProjectId = () => {
        if (typeof window !== "undefined") {
            const stored = window.localStorage?.getItem?.("VITE_FIREBASE_PROJECT_ID");
            if (stored) return stored;
        }
        return metaEnv.VITE_FIREBASE_PROJECT_ID || "outliner-d57b0";
    };

    return {
        apiKey: metaEnv.VITE_FIREBASE_API_KEY || "demo-api-key",
        authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "outliner-d57b0.firebaseapp.com",
        projectId: getProjectId(),
        storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "outliner-d57b0.appspot.com",
        messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
        appId: metaEnv.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef",
        measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || "G-XXXXXXXXXX",
    };
}

// Global cache (HMR & SSR support)
const globalKey = "__firebase_client_app__";
const globalRef = globalThis as typeof globalThis & {
    [globalKey]?: FirebaseApp;
};

/**
 * Retrieves or initializes the global Firebase app instance.
 * Centralized management function to prevent duplicate initialization in SSR environments.
 *
 * Implementation Guidelines:
 * 1. HMR & SSR support via globalThis cache
 * 2. Check for existing instances using getApps()
 * 3. Safe fallback in case of duplicate errors
 */
export function getFirebaseApp(): FirebaseApp {
    // Level 1: globalThis cache (HMR & SSR strategy)
    if (globalRef[globalKey]) {
        logger.debug("Firebase app: Using globalThis cached instance");
        return globalRef[globalKey]!;
    }

    // Level 2: Firebase SDK internal cache
    const existingApps = getApps();
    if (existingApps.length > 0) {
        const app = getApp();
        globalRef[globalKey] = app;
        logger.info("Firebase app: Using existing SDK instance");
        return app;
    }

    try {
        // Initialize new app
        const firebaseConfig = getFirebaseConfig();
        const app = initializeApp(firebaseConfig);
        globalRef[globalKey] = app;
        logger.info("Firebase app: Initialized new instance");
        return app;
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ err }, "Firebase app initialization error");

        // Use existing app in case of duplicate app error
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
 * Resets the Firebase app instance (for testing).
 */
export function resetFirebaseApp(): void {
    globalRef[globalKey] = undefined;
}
