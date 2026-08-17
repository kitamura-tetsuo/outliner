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

    /**
     * A rule that dispatchJob can actually run: the fixture serves one Y.Doc for
     * every room, so the schedules map and the target table doc share it, and
     * the table needs a schema for dispatchJob to reach the executor.
     */
    function seedRunnableRule(): Y.Map<unknown> {
        doc.getText("schema").insert(0, "CREATE TABLE t (id text primary key, title text);");
        const ruleMap = new Y.Map();
        ruleMap.set("sql", "SELECT 1;");
        ruleMap.set("targetTableId", "table1");
        doc.getMap("schedules").set("rule1", ruleMap);
        return ruleMap;
    }

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

    // The (OK)/(Error) badge the UI renders comes from lastRunStatus, which only
    // a real run writes back into the schedules map. These two cases cover that
    // write; the client-side rendering of the badge lives in
    // client/src/components/schedule/ScheduleRuleList.test.ts.
    it("should write lastRunAt/lastRunStatus back into the schedules map on success", async () => {
        const ruleMap = seedRunnableRule();
        ruleMap.set("lastRunStatus", "error");
        ruleMap.set("lastRunError", "previous failure");

        sinon.stub((scheduler as any).executor, "executeJob").resolves({ success: true, rows: [] });

        const res = await scheduler.runRuleNow("projects/proj1", "rule1");

        expect(res.success).to.be.true;
        expect(ruleMap.get("lastRunStatus")).to.equal("ok");
        expect(ruleMap.get("lastRunError")).to.be.undefined;
        expect(ruleMap.get("lastRunAt")).to.be.a("string");
    });

    it("should write lastRunStatus/lastRunError back into the schedules map on SQL failure", async () => {
        const ruleMap = seedRunnableRule();

        sinon.stub((scheduler as any).executor, "executeJob").resolves({
            success: false,
            error: "syntax error at or near INVALID",
        });

        const res = await scheduler.runRuleNow("projects/proj1", "rule1");

        expect(res.success).to.be.false;
        expect(ruleMap.get("lastRunStatus")).to.equal("error");
        expect(ruleMap.get("lastRunError")).to.equal("syntax error at or near INVALID");
        expect(ruleMap.get("lastRunAt")).to.be.a("string");
    });

    // The manual run is an extra execution, not an occurrence of the schedule:
    // the recurrence cursor in schedule_index must survive it untouched.
    it("should not advance next_run_at or occurrence_seq", async () => {
        seedRunnableRule();
        const statements: string[] = [];
        sqliteDb.prepare = (sql: string) => {
            statements.push(sql);
            return {
                all: () => [],
                run: () => {},
                get: () => ({
                    room: "projects/proj1",
                    rule_id: "rule1",
                    target_table_id: "table1",
                    timezone: "UTC",
                    rrule: "FREQ=DAILY",
                    dtstart: "2023-01-01T00:00:00.000Z",
                    next_run_at: "2023-01-02T00:00:00.000Z",
                    occurrence_seq: 1,
                    state: "active",
                }),
            };
        };
        sinon.stub((scheduler as any).executor, "executeJob").resolves({ success: true, rows: [] });

        const res = await scheduler.runRuleNow("projects/proj1", "rule1");

        expect(res.success).to.be.true;
        expect(statements.some(sql => /UPDATE\s+schedule_index/i.test(sql))).to.be.false;
    });

    // Trying the SQL out before enabling the schedule is the point of the button.
    it("should run a disabled rule", async () => {
        const ruleMap = seedRunnableRule();
        ruleMap.set("enabled", false);
        sqliteDb.prepare = () => ({ all: () => [], run: () => {}, get: () => undefined });
        const executeJob = sinon.stub((scheduler as any).executor, "executeJob").resolves({
            success: true,
            rows: [],
        });

        const res = await scheduler.runRuleNow("projects/proj1", "rule1");

        expect(res.success).to.be.true;
        expect(executeJob.calledOnce).to.be.true;
    });

    // The index only catches up with an edit once the document is stored, so a
    // run right after retargeting a rule must still use the new target table.
    it("should use the rule document's target table rather than the indexed one", async () => {
        const ruleMap = seedRunnableRule();
        ruleMap.set("targetTableId", "table-new");
        sqliteDb.prepare = () => ({
            all: () => [],
            run: () => {},
            get: () => ({
                room: "projects/proj1",
                rule_id: "rule1",
                target_table_id: "table-stale",
                timezone: "UTC",
                rrule: "FREQ=DAILY",
                dtstart: "",
                next_run_at: "2023-01-02T00:00:00.000Z",
                occurrence_seq: 1,
                state: "active",
            }),
        });
        const dispatch = sinon.stub(scheduler as any, "dispatchJob").resolves({ success: true });

        const res = await scheduler.runRuleNow("projects/proj1", "rule1");

        expect(res.success).to.be.true;
        expect(dispatch.firstCall.args[0].target_table_id).to.equal("table-new");
    });

    // current_setting('job.occurrence') must resolve to the moment the button
    // was pressed, not to a scheduled slot.
    it("should pass the current time as the occurrence", async () => {
        seedRunnableRule();
        const dispatch = sinon.stub(scheduler as any, "dispatchJob").resolves({ success: true });
        const before = Date.now();

        await scheduler.runRuleNow("projects/proj1", "rule1");

        const occurrence = Date.parse(dispatch.firstCall.args[1] as string);
        expect(occurrence).to.be.at.least(before);
        expect(occurrence).to.be.at.most(Date.now());
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
