import { expect } from "chai";
import sinon from "sinon";
import * as Y from "yjs";
import { JobScheduler } from "../../src/scheduler/Scheduler.js";

describe("Job Scheduler - runRuleNow", () => {
    let scheduler: JobScheduler;
    let hocuspocus: any;
    let sqliteDb: any;
    let doc: Y.Doc;

    beforeEach(() => {
        doc = new Y.Doc();
        hocuspocus = {
            configuration: { extensions: [] },
            openDirectConnection: async (roomName: string) => ({
                document: doc,
                disconnect: () => {},
            }),
        };

        sqliteDb = {
            prepare: () => ({
                all: () => [],
                run: () => {},
                get: () => ({
                    room: "projects/proj1",
                    rule_id: "rule1",
                    target_table_id: "table1",
                    timezone: "UTC",
                    rrule: "",
                    dtstart: "",
                    next_run_at: "2023-01-01T00:00:00.000Z",
                    occurrence_seq: 1,
                    state: "active",
                }),
            }),
        };

        scheduler = new JobScheduler(hocuspocus);
        scheduler.setDb(sqliteDb);
        // Do not start worker here as it breaks the WASM env if not correctly setup, we mock dispatchJob instead
    });

    afterEach(async () => {
        sinon.restore();
    });

    it("should return error if rule not found", async () => {
        const res = await scheduler.runRuleNow("projects/proj1", "rule1");
        expect(res.success).to.be.false;
        expect(res.error).to.equal("Rule not found");
    });

    it("should return error if rule is missing sql or targetTableId", async () => {
        const schedules = doc.getMap("schedules");
        const ruleMap = new Y.Map();
        schedules.set("rule1", ruleMap);

        const res = await scheduler.runRuleNow("projects/proj1", "rule1");
        expect(res.success).to.be.false;
        expect(res.error).to.contain("Missing required rule data");
    });

    it("should return success when dispatchJob succeeds", async () => {
        const schedules = doc.getMap("schedules");
        const ruleMap = new Y.Map();
        ruleMap.set("sql", "SELECT 1;");
        ruleMap.set("targetTableId", "table1");
        schedules.set("rule1", ruleMap);

        sinon.stub(scheduler as any, "dispatchJob").resolves({ success: true });

        const res = await scheduler.runRuleNow("projects/proj1", "rule1");
        expect(res.success).to.be.true;
        expect(res.error).to.be.undefined;
    });

    it("should return error from dispatchJob", async () => {
        const schedules = doc.getMap("schedules");
        const ruleMap = new Y.Map();
        ruleMap.set("sql", "SELECT 1;");
        ruleMap.set("targetTableId", "table1");
        schedules.set("rule1", ruleMap);

        sinon.stub(scheduler as any, "dispatchJob").rejects(new Error("Database error"));

        const res = await scheduler.runRuleNow("projects/proj1", "rule1");
        expect(res.success).to.be.false;
        expect(res.error).to.equal("Database error");
    });
});
