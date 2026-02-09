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

declare namespace jest {
    function fn(): () => void;
}

// Global definitions for the test environment
declare namespace NodeJS {
    interface Global {
        isTestEnvironment: boolean;
    }
}

import { test as base } from "@playwright/test";
import { setupEnv } from "./setup-env";

// Set environment variables for testing
setupEnv();

/**
 * Define extended test fixtures for E2E tests
 * Includes connection settings for Firebase Emulator
 */
export const test = base.extend({
    page: async ({ page }, use) => {
        // Set connection information for Firebase Emulator
        await page.addInitScript(() => {
            // Set test environment flag
            window.localStorage.setItem("VITE_IS_TEST", "true");

            // Enable Firebase Emulator
            window.localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");

            // Emulator connection info (from env vars, default is localhost)
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

            // Simulate authenticated state
            // User data for testing
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
