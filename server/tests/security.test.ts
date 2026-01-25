import { expect } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import request from "supertest";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

function toBase64(obj: any) {
    // Use standard Base64 but maybe strip padding to be safe, though Buffer handles it.
    // websocket-auth.ts uses standard Buffer decoding.
    return Buffer.from(JSON.stringify(obj)).toString("base64");
}

// Dynamic imports to ensure mocks are applied
const { loadConfig: loadConfigImport } = await import("../src/config.js");
const { startServer: startServerImport } = await import("../src/server.js");

describe("Server Security Tests", () => {
    let app: any;
    let shutdown: any;
    let dbDir: string;

    before(async () => {
        process.env.ALLOW_TEST_ACCESS = "true";
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "security-test-"));
        const config = loadConfigImport({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
        });
        const instance = await startServerImport(config);
        app = instance.server;
        shutdown = instance.shutdown;
    });

    after(async () => {
        delete process.env.ALLOW_TEST_ACCESS;
        if (shutdown) await shutdown();
        if (dbDir) await fs.remove(dbDir);
    });

    it("should reject unauthenticated request to /metrics", async () => {
        const response = await request(app).get("/metrics");
        expect(response.status).to.equal(401);
    });

    it("should accept authenticated request to /metrics", async () => {
        const header = toBase64({ alg: "none" });
        const payload = toBase64({ user_id: "test-user" });
        // alg:none token format: header.payload. (empty signature)
        const validToken = `${header}.${payload}.`;

        const response = await request(app)
            .get("/metrics")
            .set("Authorization", `Bearer ${validToken}`);

        expect(response.status).to.equal(200);
        expect(response.body).to.have.property("connections");
    });

    it("should reject unauthenticated request to /api/rotate-logs", async () => {
        const response = await request(app).post("/api/rotate-logs");
        expect(response.status).to.equal(401);
    });

    it("should reject invalid token request to /api/rotate-logs", async () => {
        const response = await request(app)
            .post("/api/rotate-logs")
            .set("Authorization", "Bearer invalid-token");
        expect(response.status).to.equal(401);
    });

    it("should reject authenticated request via query param (security fix verification)", async () => {
        const response = await request(app)
            .get("/metrics?token=valid-token");
        expect(response.status).to.equal(401);
    });

    it("should return detailed info from /health in non-production environment", async () => {
        const response = await request(app).get("/health");
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property("status", "ok");
        expect(response.body).to.have.property("timestamp");
        // In non-production, it SHOULD return env and headers
        expect(response.body).to.have.property("env");
        expect(response.body).to.have.property("headers");
    });

    it("should NOT return detailed info from /health in production environment", async () => {
        // Temporarily set NODE_ENV to production
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        try {
            const response = await request(app).get("/health");
            expect(response.status).to.equal(200);
            expect(response.body).to.have.property("status", "ok");
            expect(response.body).to.have.property("timestamp");
            // In production, it SHOULD NOT return env and headers
            expect(response.body).to.not.have.property("env");
            expect(response.body).to.not.have.property("headers");
        } finally {
            // Restore NODE_ENV
            process.env.NODE_ENV = originalEnv;
        }
    });
});
