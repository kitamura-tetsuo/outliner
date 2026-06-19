import { IncomingMessage } from "http";

/**
 * Extracts the client IP address from the request.
 * Prioritizes headers from trusted platforms (Cloudflare, Fly.io, etc.)
 * which are harder to spoof than standard X-Forwarded-For.
 */
export function getClientIp(req: IncomingMessage | Request): string {
    const getHeader = (name: string): string | string[] | null | undefined => {
        if ("headers" in req && typeof (req.headers as any).get === "function") {
            return (req.headers as Headers).get(name);
        }
        return (req as IncomingMessage).headers[name.toLowerCase()];
    };

    const first = (val: string | string[]): string => {
        if (Array.isArray(val)) return val[0];
        return val.split(",")[0].trim();
    };

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
        const val = getHeader(header);
        if (val) {
            return first(val);
        }
    }

    // Standard X-Forwarded-For
    // Takes the first IP (left-most), which is the original client IP.
    // WARNING: This is spoofable if the server is directly exposed or the proxy doesn't overwrite it.
    // However, it's the standard behavior for getting the "original" client IP.
    const xff = getHeader("x-forwarded-for");
    if (xff) {
        return first(xff);
    }

    return (req as IncomingMessage).socket?.remoteAddress || "";
}
