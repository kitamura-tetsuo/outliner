
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { startServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

// Mock Firebase Admin
// We need to mock verifyIdTokenCached because it is imported by auth-middleware directly
// and not via dependency injection in startServer (since middleware is static).
// Actually, startServer does support overrides, but the middleware is imported at the top level of server.ts.
// Wait, the middleware is imported into server.ts.
// `import { requireAuth } from "./auth-middleware.js";`
// And `auth-middleware.ts` imports `verifyIdTokenCached`.

// To mock this effectively in Vitest, we should use vi.mock.

vi.mock("../src/websocket-auth.js", async () => {
  const actual = await vi.importActual("../src/websocket-auth.js");
  return {
    ...actual,
    verifyIdTokenCached: vi.fn().mockImplementation(async (token: string) => {
        if (token === "valid-token") {
            return { uid: "test-user", role: "admin" };
        }
        throw new Error("Invalid token");
    }),
  };
});

describe("Server Security Tests", () => {
    let app: any;
    let shutdown: any;

    beforeAll(async () => {
        const config = loadConfig();
        // We pass empty overrides because we are mocking the module directly
        const instance = await startServer(config);
        app = instance.server;
        shutdown = instance.shutdown;
    });

    afterAll(async () => {
        if (shutdown) await shutdown();
        vi.restoreAllMocks();
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
});
