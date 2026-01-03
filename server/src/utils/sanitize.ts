export function sanitizeUrl(urlStr: string | undefined): string {
    if (!urlStr) return "";
    try {
        // Handle relative URLs by providing a base
        // We use a dummy base because req.url is often just path+query
        const url = new URL(urlStr, "http://dummy.com");

        const redactedKeys = ["auth", "token", "key", "password", "secret"];

        for (const key of redactedKeys) {
            if (url.searchParams.has(key)) {
                url.searchParams.set(key, "[REDACTED]");
            }
        }

        return url.pathname + url.search;
    } catch {
        return urlStr;
    }
}
