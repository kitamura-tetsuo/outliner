import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedDemo, SeedDemoError } from "./demoSeed";

describe("seedDemo", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("throws SeedDemoError with rateLimitMs for 429 response", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            statusText: "Too Many Requests",
            json: async () => ({ rateLimitMs: 5000, message: "Rate limited" })
        } as Response);

        await expect(seedDemo({ throwOnError: true })).rejects.toThrow(SeedDemoError);
        try {
            await seedDemo({ throwOnError: true });
        } catch (err: any) {
            expect(err.rateLimitMs).toBe(5000);
            expect(err.message).toBe("Rate limited");
        }
    });

    it("throws normal Error for a non-OK JSON error response without rate limit", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            statusText: "Bad Request",
            json: async () => ({ error: "Invalid data" })
        } as Response);

        await expect(seedDemo({ throwOnError: true })).rejects.toThrow("Invalid data");
        await expect(seedDemo({ throwOnError: true })).rejects.not.toThrow(SeedDemoError);
    });

    it("wraps TypeError (network rejection) in 'Failed to connect' error", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Load failed"));

        await expect(seedDemo({ throwOnError: true })).rejects.toThrow("Failed to connect to the server: Load failed");
    });

    it("does not throw if throwOnError is false or omitted", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Load failed"));

        await expect(seedDemo()).resolves.toBeUndefined();
        await expect(seedDemo({ throwOnError: false })).resolves.toBeUndefined();
    });
});
