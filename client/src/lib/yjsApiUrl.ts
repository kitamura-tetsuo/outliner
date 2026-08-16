export function resolveApiBaseUrl(): string {
    let apiBaseUrl = import.meta.env.VITE_YJS_API_URL;
    if (!apiBaseUrl && import.meta.env.VITE_YJS_WS_URL) {
        apiBaseUrl = import.meta.env.VITE_YJS_WS_URL.replace(/^ws(s)?:\/\//, "http$1://");
    }
    if (!apiBaseUrl) {
        const isProduction = import.meta.env.MODE === "production";
        apiBaseUrl = isProduction
            ? (typeof window !== "undefined" ? window.location.origin : "")
            : "http://127.0.0.1:7093";
    }
    return apiBaseUrl;
}
