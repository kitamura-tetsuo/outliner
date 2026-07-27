import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock globals for Service Worker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listeners: Record<string, (...args: any[]) => any> = {};

vi.stubGlobal("self", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener: (event: string, callback: (...args: any[]) => any) => {
        listeners[event] = callback;
    },
    skipWaiting: vi.fn(),
    clients: {
        claim: vi.fn(),
    },
});

const cachesMock = {
    match: vi.fn(),
    open: vi.fn(),
    keys: vi.fn(),
};
vi.stubGlobal("caches", cachesMock);

vi.mock("$service-worker", () => ({
    version: "test-v1",
}));

describe("Service Worker fetch handler", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Load the service worker to register listeners
        await import("../../service-worker");
    });

    it("resolves to a Response rather than undefined when fetch fails and cache misses", async () => {
        const fetchListener = listeners["fetch"];
        expect(fetchListener).toBeDefined();

        let respondWithPromise: Promise<Response> | undefined;
        const event = {
            request: {
                method: "GET",
                mode: "navigate",
                url: "http://localhost/demo/NotCached",
                clone: vi.fn(),
            },
            respondWith: (promise: Promise<Response>) => {
                respondWithPromise = promise;
            },
        };

        // Stub fetch to reject (simulate offline)
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network offline")));

        // caches.match returns undefined on all calls (cache miss)
        cachesMock.match.mockResolvedValue(undefined);

        fetchListener(event);

        expect(respondWithPromise).toBeDefined();
        const response = await respondWithPromise;

        // Before the fix, response would be undefined
        expect(response).not.toBeUndefined();
        expect(response).toBeInstanceOf(Response);
        expect(response?.status).toBe(503);
    });

    it("returns precached shell (/) for navigate requests when fetch fails and cache misses", async () => {
        const fetchListener = listeners["fetch"];

        let respondWithPromise: Promise<Response> | undefined;
        const event = {
            request: {
                method: "GET",
                mode: "navigate",
                url: "http://localhost/demo/NotCached",
                clone: vi.fn(),
            },
            respondWith: (promise: Promise<Response>) => {
                respondWithPromise = promise;
            },
        };

        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network offline")));

        // Return a dummy response for the "/" cache lookup, undefined otherwise
        cachesMock.match.mockImplementation((req) => {
            if (req === "/" || req?.url === "/") {
                return Promise.resolve(new Response("Shell", { status: 200 }));
            }
            return Promise.resolve(undefined);
        });

        fetchListener(event);
        const response = await respondWithPromise;

        expect(response).toBeInstanceOf(Response);
        expect(response?.status).toBe(200);
        expect(await response?.text()).toBe("Shell");

        vi.unstubAllGlobals();
    });
});
