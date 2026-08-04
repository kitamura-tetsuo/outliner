import { getLogger } from "./logger";

const logger = getLogger("demoSeed");

// Room id of the public demo project (room: projects/demo)
export const DEMO_PROJECT_NAME = "demo";

export class SeedDemoError extends Error {
    rateLimitMs?: number;
    constructor(message: string, rateLimitMs?: number) {
        super(message);
        this.name = "SeedDemoError";
        this.rateLimitMs = rateLimitMs;
    }
}

function resolveApiBaseUrl(): string {
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

export interface SeedDemoResult {
    ok: boolean;
    /** True when the server actually rebuilt the demo document for this request. */
    reset: boolean;
    /** True when the server answered from its warm fast path without opening the document. */
    warm?: boolean;
    reason?: "network" | "http" | "rate-limit";
}

/**
 * Seed (or reset) the public demo project via the backend API.
 * Failures are logged but never thrown: the demo should still open
 * with whatever content is currently in the shared document.
 *
 * Pass `{ force: true }` to trigger the 24h reset manually, regardless of
 * when the demo content was last seeded.
 */
export async function seedDemo(
    options: { force?: boolean; throwOnError?: boolean; } = {},
): Promise<SeedDemoResult> {
    try {
        const apiBaseUrl = resolveApiBaseUrl();
        // Append /api/seed-demo, ensuring we don't double up on slashes
        const endpoint = apiBaseUrl.endsWith("/")
            ? `${apiBaseUrl}api/seed-demo`
            : `${apiBaseUrl}/api/seed-demo`;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ force: options.force === true }),
        });
        if (!response.ok) {
            let errorMsg = response.statusText;
            let errorRateLimitMs: number | undefined = undefined;
            try {
                const errorData = await response.json();
                if (errorData && errorData.rateLimitMs) {
                    errorRateLimitMs = errorData.rateLimitMs;
                }
                if (errorData && errorData.message) {
                    errorMsg = errorData.message;
                } else if (errorData && errorData.error) {
                    errorMsg = errorData.error;
                }
            } catch (_e) {
                // Ignore JSON parse error, keep statusText
            }
            logger.warn(`Failed to seed demo: ${errorMsg}`);
            if (options.throwOnError) {
                if (errorRateLimitMs !== undefined) {
                    throw new SeedDemoError(errorMsg, errorRateLimitMs);
                }
                throw new Error(errorMsg);
            }
            return { ok: false, reset: false, reason: errorRateLimitMs !== undefined ? "rate-limit" : "http" };
        }
        // The caller needs to know whether the document was rebuilt: only then
        // must it reconnect instead of keeping the already-synced client.
        let reset = false;
        let warm = false;
        try {
            const data = await response.json();
            reset = data?.reset === true;
            warm = data?.warm === true;
        } catch (_e) {
            // A body-less 200 means "nothing to do"; keep the defaults.
        }
        return { ok: true, reset, warm };
    } catch (seedErr) {
        if (options.throwOnError) {
            if (seedErr instanceof SeedDemoError) {
                throw seedErr;
            }
            if (seedErr instanceof TypeError) {
                throw new Error(`Failed to connect to the server: ${seedErr.message}`, { cause: seedErr });
            }
            throw seedErr;
        }
        logger.warn(`Error seeding demo ${seedErr}`);
        if (seedErr instanceof TypeError) {
            return { ok: false, reset: false, reason: "network" };
        }
        return { ok: false, reset: false, reason: "http" };
    }
}
