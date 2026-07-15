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
    beforeEach(() => {
        process.env.ALLOW_TEST_ACCESS = "false";
    });
    afterEach(() => {
        delete process.env.ALLOW_TEST_ACCESS;
    });
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

    it("should allow all if allowlist is empty (non-production)", async () => {
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

    it("should fail to start in production if allowlist is empty", async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cors-test-5-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
            ORIGIN_ALLOWLIST: "",
        });

        try {
            await startServer(config);
            expect.fail("Should have thrown an error");
        } catch (err: any) {
            expect(err.message).to.include("SECURITY CRITICAL: ORIGIN_ALLOWLIST is empty in production");
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });

    it("should start in production with empty allowlist if ALLOW_ALL_ORIGINS=true, and disable credentials", async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        process.env.ALLOW_ALL_ORIGINS = "true";
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cors-test-6-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
            ORIGIN_ALLOWLIST: "",
        });

        try {
            const instance = await startServer(config);
            app = instance.server;
            shutdown = instance.shutdown;

            const res = await request(app)
                .get("/health")
                .set("Origin", "http://random.com");

            expect(res.status).to.equal(200);
            expect(res.header["access-control-allow-origin"]).to.equal("http://random.com");
            // With credentials: false (the default when we explicitly don't return Access-Control-Allow-Credentials: true)
            expect(res.header["access-control-allow-credentials"]).to.be.undefined;
        } finally {
            process.env.NODE_ENV = originalEnv;
            delete process.env.ALLOW_ALL_ORIGINS;
        }
    });
});
