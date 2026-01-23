import { jest } from "@jest/globals";
import request from "supertest";

// Mock Firebase Admin
jest.unstable_mockModule("../src/websocket-auth.js", () => {
    return {
        __esModule: true,
        verifyIdTokenCached: jest.fn().mockImplementation(async (token: any) => {
            if (token === "valid-token") {
                return { uid: "test-user", role: "admin" };
            }
            throw new Error("Invalid token");
        }),
        extractAuthToken: jest.fn(),
        clearTokenCache: jest.fn(),
        getTokenCacheSize: jest.fn(),
    };
});

// Dynamic imports
const { loadConfig } = await import("../src/config.js");
const { startServer } = await import("../src/server.js");

describe("Rate Limiting Tests", () => {
    let app: any;
    let shutdown: any;

    beforeAll(async () => {
        const config = loadConfig();
        // Override rate limits for testing
        config.RATE_LIMIT_MAX_REQUESTS = 5;
        config.RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

        const instance = await startServer(config);
        app = instance.server;
        shutdown = instance.shutdown;
    });

    afterAll(async () => {
        if (shutdown) await shutdown();
        jest.restoreAllMocks();
    });

    it("should enforce rate limits on HTTP endpoints", async () => {
        // Send 5 allowed requests
        for (let i = 0; i < 5; i++) {
            const response = await request(app).get("/health");
            expect(response.status).toBe(200);
        }

        // Send 6th request (should be blocked)
        const response = await request(app).get("/health");
        expect(response.status).toBe(429);
        expect(response.body).toEqual({ error: "Too Many Requests" });
    });
});
