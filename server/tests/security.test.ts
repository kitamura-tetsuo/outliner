import { jest } from "@jest/globals";
import request from "supertest";

// Mock Firebase Admin FIRST, before importing any modules that use it
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

// Dynamic imports to ensure mocks are applied
const { loadConfig } = await import("../src/config.js");
const { startServer } = await import("../src/server.js");

describe("Server Security Tests", () => {
    let app: any;
    let shutdown: any;

    beforeAll(async () => {
        const config = loadConfig();
        const instance = await startServer(config);
        app = instance.server;
        shutdown = instance.shutdown;
    });

    afterAll(async () => {
        if (shutdown) await shutdown();
        jest.restoreAllMocks();
    });

    it("should reject unauthenticated request to /metrics", async () => {
        const response = await request(app).get("/metrics");
        expect(response.status).toBe(401);
    });

    it("should accept authenticated request to /metrics", async () => {
        const response = await request(app)
            .get("/metrics")
            .set("Authorization", "Bearer valid-token");
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("connections");
    });

    it("should reject unauthenticated request to /api/rotate-logs", async () => {
        const response = await request(app).post("/api/rotate-logs");
        expect(response.status).toBe(401);
    });

    it("should reject invalid token request to /api/rotate-logs", async () => {
        const response = await request(app)
            .post("/api/rotate-logs")
            .set("Authorization", "Bearer invalid-token");
        expect(response.status).toBe(401);
    });

    it("should reject authenticated request via query param (security fix verification)", async () => {
        const response = await request(app)
            .get("/metrics?token=valid-token");
        expect(response.status).toBe(401);
    });
});
