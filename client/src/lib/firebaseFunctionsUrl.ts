export function getFirebaseFunctionUrl(functionName: string): string {
    const isTest = typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true";
    const useEmulator = typeof window !== "undefined"
        && (window.localStorage?.getItem?.("VITE_USE_FIREBASE_EMULATOR") === "true"
            || import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true");

    if (useEmulator || isTest) {
        // Use emulator in test environment
        const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
        // Assuming Functions emulator is running on port 5001 or 57000 (via Hosting)
        // If via Hosting emulator:
        return `http://${host}:57000/api/${functionName}`;
    }

    // In production environment
    // Should be deployed to same domain or specific URL
    if (import.meta.env.VITE_FIREBASE_FUNCTIONS_URL) {
        return `${import.meta.env.VITE_FIREBASE_FUNCTIONS_URL}/${functionName}`;
    }

    return `/api/${functionName}`;
}
