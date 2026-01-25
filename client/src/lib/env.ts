// Environment variable management utility

// Debug configuration
interface DebugConfig {
    isTest: boolean;
    useEmulator: boolean;
    firebaseProjectId: string;
    // Add other necessary configurations
}

/**
 * Get configuration for debugging
 */
export function getDebugConfig(): DebugConfig {
    // In browser environment
    if (typeof window !== "undefined") {
        return {
            isTest: window.localStorage?.getItem("VITE_IS_TEST") === "true" || import.meta.env.MODE === "test",
            useEmulator: window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true"
                || import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true",
            firebaseProjectId: window.localStorage?.getItem("VITE_FIREBASE_PROJECT_ID")
                || import.meta.env.VITE_FIREBASE_PROJECT_ID || "outliner-d57b0",
        };
    }

    // In SSR or test environment
    return {
        isTest: import.meta.env.MODE === "test",
        useEmulator: import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true",
        firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "outliner-d57b0",
    };
}

/**
 * Check if running in test environment
 */
export function isTestEnvironment(): boolean {
    const config = getDebugConfig();
    return config.isTest;
}

/**
 * Check if using Firebase Emulator
 */
export function isUsingEmulator(): boolean {
    const config = getDebugConfig();
    return config.useEmulator;
}
