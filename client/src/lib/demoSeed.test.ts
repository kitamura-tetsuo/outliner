import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
            json: async () => ({ rateLimitMs: 5000, message: "Rate limited" }),
        } as Response);

        await expect(seedDemo("demo", { throwOnError: true })).rejects.toThrow(SeedDemoError);
        try {
            await seedDemo("demo", { throwOnError: true });
        } catch (err) {
            expect(err).toBeInstanceOf(SeedDemoError);
            const seedErr = err as SeedDemoError;
            expect(seedErr.rateLimitMs).toBe(5000);
            expect(seedErr.message).toBe("Rate limited");
        }
    });

    it("throws normal Error for a non-OK JSON error response without rate limit", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            statusText: "Bad Request",
            json: async () => ({ error: "Invalid data" }),
        } as Response);

        await expect(seedDemo("demo", { throwOnError: true })).rejects.toThrow("Invalid data");
        await expect(seedDemo("demo", { throwOnError: true })).rejects.not.toThrow(SeedDemoError);
    });

    it("wraps TypeError (network rejection) in 'Failed to connect' error", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Load failed"));

        await expect(seedDemo("demo", { throwOnError: true })).rejects.toThrow(
            "Failed to connect to the server: Load failed",
        );
    });

    it("reports the server's reset verdict so callers know whether to reconnect", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            statusText: "OK",
            json: async () => ({ success: true, reset: true }),
        } as Response);

        await expect(seedDemo("demo")).resolves.toEqual({ ok: true, reset: true, warm: false });
    });

    it("reports the warm fast path as a no-reset result", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            statusText: "OK",
            json: async () => ({ success: true, reset: false, warm: true }),
        } as Response);

        await expect(seedDemo("demo")).resolves.toEqual({ ok: true, reset: false, warm: true });
    });

    it("treats an unparsable success body as 'nothing to do'", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            statusText: "OK",
            json: async () => {
                throw new SyntaxError("Unexpected end of JSON input");
            },
        } as unknown as Response);

        await expect(seedDemo("demo")).resolves.toEqual({ ok: true, reset: false, warm: false });
    });

    it("does not throw if throwOnError is false or omitted", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Load failed"));

        await expect(seedDemo("demo")).resolves.toEqual({ ok: false, reset: false, reason: "network" });
        await expect(seedDemo("demo", { throwOnError: false })).resolves.toEqual({
            ok: false,
            reset: false,
            reason: "network",
        });
    });
});

describe("seedDemo project targeting", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("tells the server which demo project to seed", async () => {
        // The server keys every demo document, warm verdict and cooldown by
        // project, so the request has to name one.
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            statusText: "OK",
            json: async () => ({ success: true, reset: false }),
        } as Response);
        globalThis.fetch = fetchMock;

        await seedDemo("demo-ja", { force: true });

        const [, init] = fetchMock.mock.calls[0];
        expect(JSON.parse(init.body as string)).toEqual({ force: true, project: "demo-ja" });
    });
});
