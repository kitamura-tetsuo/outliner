import { IncomingMessage } from "http";

export interface ProxyConfig {
    TRUST_PROXY_HEADERS: boolean;
    TRUSTED_PROXY_HOPS: number;
}

/**
 * Extracts the client IP address from the request.
 * Prioritizes headers from trusted platforms (Cloudflare, Fly.io, etc.)
 * which are harder to spoof than standard X-Forwarded-For.
 */
export function getClientIp(req: IncomingMessage | Request, config: ProxyConfig = { TRUST_PROXY_HEADERS: false, TRUSTED_PROXY_HOPS: 1 }): string {
    const fallbackIp = (req as IncomingMessage).socket?.remoteAddress || "";

    if (!config.TRUST_PROXY_HEADERS) {
        return fallbackIp;
    }

    const getHeader = (name: string): string | string[] | null | undefined => {
        if ("headers" in req && typeof (req.headers as Headers).get === "function") {
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
    // Selects the entry by hop count from the right, preventing left-most spoofing.
    const xff = getHeader("x-forwarded-for");
    if (xff) {
        let parts: string[];
        if (Array.isArray(xff)) {
            parts = xff.map(s => s.trim());
        } else {
            parts = xff.split(",").map(s => s.trim());
        }
        const index = Math.max(0, parts.length - config.TRUSTED_PROXY_HOPS);
        return parts[index];
    }

    return fallbackIp;
}
