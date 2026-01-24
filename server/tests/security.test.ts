import { expect } from "chai";
import request from "supertest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

function toBase64(obj: any) {
    // Use standard Base64 but maybe strip padding to be safe, though Buffer handles it.
    // websocket-auth.ts uses standard Buffer decoding.
    return Buffer.from(JSON.stringify(obj)).toString("base64");
}

describe("Server Security Tests", () => {
    let app: any;
    let shutdown: any;
    let dbDir: string;

    before(async () => {
        process.env.ALLOW_TEST_ACCESS = "true";
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "security-test-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
        });
        const instance = await startServer(config);
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
});
