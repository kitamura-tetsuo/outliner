// Debug utility

export function debugLog(message: string, ...args: any[]) {
    if (import.meta.env.VITE_DEBUG_MODE === "true") {
        console.log(`[DEBUG] ${message}`, ...args);
    }
}

export function debugError(message: string, ...args: any[]) {
    if (import.meta.env.VITE_DEBUG_MODE === "true") {
        console.error(`[DEBUG ERROR] ${message}`, ...args);
    }
}

// Global debug object (for console)
if (typeof window !== "undefined") {
    (window as any).__DEBUG__ = {
        log: debugLog,
        error: debugError,
    };
}
