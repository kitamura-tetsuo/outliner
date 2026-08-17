import { expect } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import request from "supertest";
import { loadConfig } from "../../src/config.js";
import { startServer } from "../../src/server.js";

/**
 * The "Run now" buttons post to /api/schedules/run-now on the Yjs server, so
 * the route has to be reachable on the app startServer() builds — a router
 * that exists but is never mounted answers 404 and the feature silently does
 * nothing.
 */
describe("Schedule Run API mounting", () => {
    let app: any;
    let shutdown: any;
    let dbDir: string;

    before(async () => {
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-run-mount-"));
        const config = loadConfig({
            PORT: "0",
            LOG_LEVEL: "silent",
            DATABASE_PATH: dbDir,
        });
        const instance = await startServer(config, undefined, {
            verifyIdTokenCached: (async () => ({ uid: "user123" })) as any,
            checkContainerAccess: (async () => true) as any,
        });
        app = instance.server;
        shutdown = instance.shutdown;
    });

    after(async () => {
        if (shutdown) await shutdown();
        if (dbDir) await fs.remove(dbDir);
    });

    it("rejects an unauthenticated run-now request instead of returning 404", async () => {
        const res = await request(app)
            .post("/api/schedules/run-now")
            .send({ projectId: "proj1", ruleId: "rule1" });
        expect(res.status).to.equal(401);
    });

    it("validates the body of an authenticated run-now request", async () => {
        const res = await request(app)
            .post("/api/schedules/run-now")
            .set("Authorization", "Bearer validtoken")
            .send({ projectId: "proj1" });
        expect(res.status).to.equal(400);
    });

    it("reaches the scheduler for an authorized run-now request", async () => {
        const res = await request(app)
            .post("/api/schedules/run-now")
            .set("Authorization", "Bearer validtoken")
            .send({ projectId: "proj1", ruleId: "missing-rule" });
        // The rule does not exist in an empty project, which only the
        // scheduler itself can report: reaching that answer proves the route
        // is wired to the running scheduler rather than to a 404.
        expect(res.status).to.equal(404);
        expect(res.body.error).to.equal("Rule not found");
    });
});
