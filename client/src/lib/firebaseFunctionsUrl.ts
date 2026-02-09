/**
 * Firebase Functions URL Helper
 * Generates appropriate Firebase Functions URLs based on the environment.
 */

import { getEnv } from "./env";

/**
 * Converts Firebase Functions URL based on the environment.
 * @param functionName - The name of the function to call
 * @returns The appropriate URL
 */
export function getFirebaseFunctionUrl(functionName: string): string {
    const apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57070");
    const isTest = getEnv("VITE_IS_TEST", "false") === "true";

    // Access via Firebase Hosting Emulator in test environment
    if (isTest) {
        // Direct access to functions emulator to avoid hosting rewrite configuration issues in tests
        // Port 57070 is the default for functions emulator
        return `http://127.0.0.1:57070/outliner-d57b0/us-central1/${functionName}`;
    }

    // When using Firebase Hosting Emulator (localhost:57000)
    if (apiBaseUrl === "http://localhost:57000") {
        // Access via Firebase Hosting Emulator rewrite rules
        return `${apiBaseUrl}/api/${functionName}`;
    }

    // When using local development environment (Direct Firebase Functions Emulator)
    if (apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1")) {
        // Emulator requires /outliner-d57b0/us-central1/ prefix
        return `${apiBaseUrl}/outliner-d57b0/us-central1/${functionName}`;
    }

    // For production environment
    // Accessible via /api/function-name using Firebase Hosting rewrite rules
    return `${apiBaseUrl}/api/${functionName}`;
}

/**
 * URL when accessing via SvelteKit API proxy
 * @param apiPath - API path (e.g., 'azure-health-check')
 * @returns SvelteKit API proxy URL
 */
export function getSvelteKitApiUrl(apiPath: string): string {
    // SvelteKit API proxy always uses /api/ prefix
    // Note: If running in test mode and the API is handled by SvelteKit (Vite),
    // we should ensure we are targeting the SvelteKit server, not Firebase Functions.
    return `/api/${apiPath}`;
}

/**
 * Environment check helper
 */
export function isLocalDevelopment(): boolean {
    const apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57070");
    const isTest = getEnv("VITE_IS_TEST", "false") === "true";

    // Always return false in test environment (treat as production)
    if (isTest) {
        return false;
    }

    return apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1");
}

/**
 * For debugging: Display current configuration
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
