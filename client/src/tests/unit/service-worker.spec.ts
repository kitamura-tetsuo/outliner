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

vi.mock("$service-worker", () => ({
    build: ["/build1.js"],
    files: ["/file1.png"],
    version: "1.0.0",
}));

describe("Service Worker", () => {
    let fetchHandler: (event: unknown) => void;

    beforeAll(async () => {
        await import("../../service-worker");
        const fetchCall = mockAddEventListener.mock.calls.find(call => call[0] === "fetch");
        expect(fetchCall).toBeDefined();
        fetchHandler = fetchCall[1];
    });

    beforeEach(() => {
        mockFetch.mockReset();
        mockCaches.match.mockReset();
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
