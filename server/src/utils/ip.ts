import { IncomingMessage } from "http";

/**
 * Extracts the client IP address from the request.
 * Prioritizes headers from trusted platforms (Cloudflare, Fly.io, etc.)
 * which are harder to spoof than standard X-Forwarded-For.
 */
export function getClientIp(req: IncomingMessage): string {
    const headers = req.headers;

    // Trusted Platform Headers
    // These headers are typically stripped by the platform edge and re-added,
    // making them more trustworthy than X-Forwarded-For which can be set by the client.
    const platformHeaders = [
        "cf-connecting-ip", // Cloudflare
        "fly-client-ip", // Fly.io
        "fastly-client-ip", // Fastly
        "true-client-ip", // Akamai / Cloudflare Enterprise
    ];

    for (const header of platformHeaders) {
        const val = headers[header];
        if (val) {
            return Array.isArray(val) ? val[0] : val.split(",")[0].trim();
        }
    }

    // Standard X-Forwarded-For
    // Takes the first IP (left-most), which is the original client IP.
    // WARNING: This is spoofable if the server is directly exposed or the proxy doesn't overwrite it.
    // However, it's the standard behavior for getting the "original" client IP.
    const xff = headers["x-forwarded-for"];
    if (xff) {
        return Array.isArray(xff) ? xff[0] : xff.split(",")[0].trim();
    }

    return req.socket?.remoteAddress || "";
}
