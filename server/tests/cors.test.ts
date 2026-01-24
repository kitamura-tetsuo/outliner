import { expect } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import request from "supertest";
import { loadConfig } from "../src/config.js";
import { startServer } from "../src/server.js";

describe("CORS Middleware", () => {
    let app: any;
    let shutdown: any;
    let dbDir: string;

    afterEach(async () => {
        if (shutdown) await shutdown();
        if (dbDir) {
            await fs.remove(dbDir);
        }
    });

    it("should allow request from allowed origin", async () => {
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cors-test-1-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
            ORIGIN_ALLOWLIST: "http://example.com",
        });
        const instance = await startServer(config);
        app = instance.server;
        shutdown = instance.shutdown;

        const res = await request(app)
            .get("/health")
            .set("Origin", "http://example.com");

        expect(res.status).to.equal(200);
        expect(res.header["access-control-allow-origin"]).to.equal("http://example.com");
    });

    it("should block request from disallowed origin (no headers)", async () => {
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cors-test-2-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
            ORIGIN_ALLOWLIST: "http://example.com",
        });
        const instance = await startServer(config);
        app = instance.server;
        shutdown = instance.shutdown;

        const res = await request(app)
            .get("/health")
            .set("Origin", "http://evil.com");

        // Default CORS behavior: response is successful but no CORS headers
        // Or fail if we implement strict error.
        // For now, let's assume we want to block it (status 500 or just no headers).
        // Common express `cors` middleware with origin check returning false usually yields no CORS headers.
        // If we throw error, it yields 500.

        // I will implement "no headers" check first.
        expect(res.header["access-control-allow-origin"]).to.be.undefined;
    });

    it("should allow request without origin (server-to-server)", async () => {
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cors-test-3-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
            ORIGIN_ALLOWLIST: "http://example.com",
        });
        const instance = await startServer(config);
        app = instance.server;
        shutdown = instance.shutdown;

        const res = await request(app)
            .get("/health");

        expect(res.status).to.equal(200);
    });

    it("should allow all if allowlist is empty", async () => {
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cors-test-4-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
            ORIGIN_ALLOWLIST: "",
        });
        const instance = await startServer(config);
        app = instance.server;
        shutdown = instance.shutdown;

        const res = await request(app)
            .get("/health")
            .set("Origin", "http://random.com");

        expect(res.status).to.equal(200);
        expect(res.header["access-control-allow-origin"]).to.equal("http://random.com");
    });
});
