/**
 * Firebase Functions URL Helper
 * Generates appropriate Firebase Functions URLs depending on the environment.
 */

import { getEnv } from "./env";

/**
 * Converts the Firebase Functions URL based on the environment.
 * @param functionName - The name of the function to call.
 * @returns The appropriate URL.
 */
export function getFirebaseFunctionUrl(functionName: string): string {
    const apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57070");
    const isTest = getEnv("VITE_IS_TEST", "false") === "true";

    // Access via Firebase Hosting emulator in test environment
    if (isTest) {
        return `http://localhost:57000/api/${functionName}`;
    }

    // In case of Firebase Hosting emulator (localhost:57000)
    if (apiBaseUrl === "http://localhost:57000") {
        // Access via Firebase Hosting emulator rewrites rules
        return `${apiBaseUrl}/api/${functionName}`;
    }

    // In case of local development environment (direct access to Firebase Functions emulator)
    if (apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1")) {
        // Emulator requires /outliner-d57b0/us-central1/ prefix
        return `${apiBaseUrl}/outliner-d57b0/us-central1/${functionName}`;
    }

    // In case of production environment
    // Access available via /api/functionName due to Firebase Hosting rewrites rules
    return `${apiBaseUrl}/api/${functionName}`;
}

/**
 * URL when accessing via SvelteKit API proxy.
 * @param apiPath - API path (e.g., 'azure-health-check')
 * @returns The SvelteKit API proxy URL.
 */
export function getSvelteKitApiUrl(apiPath: string): string {
    // SvelteKit API proxy always uses /api/ prefix
    return `/api/${apiPath}`;
}

/**
 * Environment check helper.
 */
export function isLocalDevelopment(): boolean {
    const apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57070");
    const isTest = getEnv("VITE_IS_TEST", "false") === "true";

    // Always return false in test environment (treat as production environment)
    if (isTest) {
        return false;
    }

    return apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1");
}

/**
 * For debugging: Displays current configuration.
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
