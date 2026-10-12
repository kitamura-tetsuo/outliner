import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockCaches = {
    open: vi.fn(),
    match: vi.fn(),
    keys: vi.fn(),
    delete: vi.fn(),
};

const mockFetch = vi.fn();
const mockAddEventListener = vi.fn();

vi.stubGlobal("caches", mockCaches);
vi.stubGlobal("fetch", mockFetch);
vi.stubGlobal("self", {
    addEventListener: mockAddEventListener,
    skipWaiting: vi.fn(),
    clients: {
        claim: vi.fn(),
    },
});

// SvelteKit 3 build inputs: `$app/manifest` paths are relative to the base
// path and are resolved through `$app/paths` (base path "" here).
vi.mock("$app/env", () => ({ version: "1.0.0" }));
vi.mock("$app/manifest", () => ({
    immutable: [{ path: "_app/immutable/entry/start.abc.js" }],
    assets: [{ path: "favicon.png" }],
    prerendered: [],
}));
vi.mock("$app/paths", () => ({
    resolve: (path: string) => `/${path}`,
    asset: (path: string) => `/${path}`,
}));

describe("Service Worker", () => {
    let fetchHandler: (event: unknown) => void;
    let installHandler: (event: { waitUntil(p: Promise<unknown>): void; }) => void;

    beforeAll(async () => {
        await import("../../service-worker");
        const fetchCall = mockAddEventListener.mock.calls.find(call => call[0] === "fetch");
        expect(fetchCall).toBeDefined();
        fetchHandler = fetchCall![1];
        const installCall = mockAddEventListener.mock.calls.find(call => call[0] === "install");
        expect(installCall).toBeDefined();
        installHandler = installCall![1];
    });

    beforeEach(() => {
        mockFetch.mockReset();
        mockCaches.match.mockReset();
    });

    describe("Install", () => {
        it("precaches the app shell, Vite-built immutable files and static assets under a versioned cache", async () => {
            const addAll = vi.fn().mockResolvedValue(undefined);
            mockCaches.open.mockResolvedValue({ addAll });
            let installed: Promise<unknown> | undefined;
            installHandler({ waitUntil: (p: Promise<unknown>) => (installed = p) });
            await installed;

            expect(mockCaches.open).toHaveBeenCalledWith("outliner-cache-1.0.0");
            expect(addAll).toHaveBeenCalledWith([
                "/",
                "/_app/immutable/entry/start.abc.js",
                "/favicon.png",
            ]);
        });
    });

    describe("Fetch Event Fallback Logic", () => {
        it("resolves to root / shell if request is navigation, offline, and exact URL not in cache", async () => {
            const request = {
                url: "http://localhost/demo/Some%20Page",
                method: "GET",
                mode: "navigate",
            };

            const respondWithMock = vi.fn();
            const event = {
                request,
                respondWith: respondWithMock,
            };

            mockFetch.mockRejectedValue(new Error("Network error"));

            const shellResponse = new Response("shell");
            mockCaches.match.mockImplementation(async (req) => {
                if (req === "/") return shellResponse;
                return undefined;
            });

            fetchHandler(event);

            expect(respondWithMock).toHaveBeenCalled();
            const respondWithPromise = respondWithMock.mock.calls[0][0];
            const result = await respondWithPromise;

            expect(result).toBe(shellResponse);
        });

        it("resolves to 503 if request is navigation, offline, exact URL not in cache, and / not in cache", async () => {
            const request = {
                url: "http://localhost/demo/Some%20Page",
                method: "GET",
                mode: "navigate",
            };

            const respondWithMock = vi.fn();
            const event = {
                request,
                respondWith: respondWithMock,
            };

            mockFetch.mockRejectedValue(new Error("Network error"));
            mockCaches.match.mockResolvedValue(undefined);

            fetchHandler(event);

            const respondWithPromise = respondWithMock.mock.calls[0][0];
            const result = await respondWithPromise;

            expect(result).toBeInstanceOf(Response);
            expect(result.status).toBe(503);
            expect(await result.text()).toBe("Network error");
        });
    });
});
