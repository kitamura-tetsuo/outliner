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
        apiBaseUrl = "http://127.0.0.1:7093";
    }
    return apiBaseUrl;
}

/**
 * Seed (or reset) the public demo project via the backend API.
 * Failures are logged but never thrown: the demo should still open
 * with whatever content is currently in the shared document.
 *
 * Pass `{ force: true }` to trigger the 24h reset manually, regardless of
 * when the demo content was last seeded.
 */
export async function seedDemo(options: { force?: boolean; throwOnError?: boolean; } = {}): Promise<{ ok: boolean; reason?: "network" | "http" }> {
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
            return { ok: false, reason: "http" };
        }
        return { ok: true };
    } catch (seedErr) {
        if (options.throwOnError && seedErr instanceof SeedDemoError) {
            throw seedErr;
        } else if (options.throwOnError && seedErr instanceof Error && seedErr.message !== "Failed to fetch") {
            throw seedErr;
        } else if (options.throwOnError && seedErr instanceof Error) {
            // Re-throw if it was an error we created, otherwise it might be network fetch error
            if (!seedErr.message.includes("fetch")) {
                throw seedErr;
            } else {
                throw new Error(`Failed to connect to the server: ${seedErr.message}`, { cause: seedErr });
            }
        }
        logger.warn(`Error seeding demo ${seedErr}`);
        return { ok: false, reason: "network" };
    }
}
