import { expect } from "chai";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createScheduleRunRouter } from "../../src/scheduler/schedule-run-api.js";
import * as accessControl from "../../src/access-control.js";
import * as websocketAuth from "../../src/websocket-auth.js";
import { JobScheduler } from "../../src/scheduler/Scheduler.js";
import sinon from "sinon";

describe("Schedule Run API", () => {
    let app: express.Express;
    let hocuspocus: any;
    let scheduler: sinon.SinonStubbedInstance<JobScheduler>;
    let authStub: sinon.SinonStub;
    let accessStub: sinon.SinonStub;

    beforeEach(async () => {
        hocuspocus = {};
        scheduler = sinon.createStubInstance(JobScheduler);
        authStub = sinon.stub().resolves({ uid: "user123" } as any);
        accessStub = sinon.stub().resolves(true);

        app = express();
        app.use(express.json());
        app.use("/api", createScheduleRunRouter(hocuspocus, () => scheduler as unknown as JobScheduler, {
            verifyIdTokenCached: authStub,
            checkContainerAccess: accessStub
        }));
    });

    afterEach(() => {
        sinon.restore();
    });

    it("should return 401 if no auth token is provided", async () => {
        const res = await request(app)
            .post("/api/schedules/run-now")
            .send({ projectId: "proj1", ruleId: "rule1" });
        expect(res.status).to.equal(401);
    });

    it("should return 403 if user has no access", async () => {
        accessStub.resolves(false);
        const res = await request(app)
            .post("/api/schedules/run-now")
            .set("Authorization", "Bearer validtoken")
            .send({ projectId: "proj1", ruleId: "rule1" });
        expect(res.status).to.equal(403);
    });

    it("should return 404 if rule is not found", async () => {
        scheduler.runRuleNow.resolves({ success: false, error: "Rule not found" });
        const res = await request(app)
            .post("/api/schedules/run-now")
            .set("Authorization", "Bearer validtoken")
            .send({ projectId: "proj1", ruleId: "rule1" });
        expect(res.status).to.equal(404);
        expect(res.body.error).to.equal("Rule not found");
    });

    it("should return 400 for bad rule data", async () => {
        scheduler.runRuleNow.resolves({ success: false, error: "Missing required rule data (sql or targetTableId)" });
        const res = await request(app)
            .post("/api/schedules/run-now")
            .set("Authorization", "Bearer validtoken")
            .send({ projectId: "proj1", ruleId: "rule1" });
        expect(res.status).to.equal(400);
        expect(res.body.error).to.contain("Missing required rule data");
    });

    it("should return 200 on success", async () => {
        scheduler.runRuleNow.resolves({ success: true });
        const res = await request(app)
            .post("/api/schedules/run-now")
            .set("Authorization", "Bearer validtoken")
            .send({ projectId: "proj1", ruleId: "rule1" });
        expect(res.status).to.equal(200);
        expect(res.body.ok).to.be.true;
    });
});
