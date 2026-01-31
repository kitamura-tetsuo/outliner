// Directly import dotenv to load .env.test during testing
import { log } from "./logger"; // Import logger

/**
 * Function to retrieve environment variables
 * @param key The key of the environment variable
 * @param defaultValue The default value
 * @returns The value of the environment variable, or the default value if undefined
 */
export function getEnv(key: string, defaultValue: string = ""): string {
    // Detection of execution environment - VITE_IS_TEST is not available in client runtime for security
    const isTestEnv = (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test")
        || (typeof process !== "undefined" && process.env?.NODE_ENV === "test")
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        || (typeof window !== "undefined" && (window as any).__E2E__ === true);

    // Processing specific to the test environment
    if (isTestEnv) {
        // Log output related to testing
        if (key === "VITE_USE_TINYLICIOUS" || key === "VITE_FORCE_AZURE") {
            log("env", "debug", `Test environment detected, checking value for ${key}`);
        }

        // Retrieve value directly from environment variables
        const envValue = typeof import.meta !== "undefined" && import.meta.env?.[key];
        if (envValue !== undefined) {
            log("env", "debug", `Using value for ${key}: ${envValue}`);
            return envValue as string;
        }

        // Default values for the test environment
        if (key === "VITE_USE_TINYLICIOUS") return "true";
        if (key === "VITE_FORCE_AZURE") return "false";
    }

    return (typeof import.meta !== "undefined" && import.meta.env?.[key]) || defaultValue;
}

/**
 * Function to retrieve environment configuration for debugging
 */
export function getDebugConfig() {
    return {
        isDevelopment: (typeof import.meta !== "undefined" && import.meta.env?.DEV) || false,
        isTest: (typeof import.meta !== "undefined" && import.meta.env?.VITE_IS_TEST) || false,
        host: typeof window !== "undefined" ? window.location.host : "server-side",
        nodeEnv: (typeof import.meta !== "undefined" && import.meta.env?.MODE) || "unknown",
    };
}
