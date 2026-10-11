import { expect } from "chai";
import * as Y from "yjs";
import type { JobData, JobResult } from "../../src/scheduler/worker-types.js";
import {
    type CatalogScheduleFixture,
    catalogService,
    closeFixture,
    fixture,
    records,
    seedCatalogSchedule,
    storedRule,
    TYPE_NAME,
    UID,
} from "./catalog-schedule-fixture.js";

describe("Schedule catalog refusal boundaries (#5535 REQ-007)", function() {
    this.timeout(120_000);
    let value: CatalogScheduleFixture;

    beforeEach(async () => value = await fixture());
    afterEach(async () => await closeFixture(value));

    it("refuses an unavailable referenced Table instead of reporting empty success", async () => {
        const projectId = "schedule-catalog-unavailable";
        await seedCatalogSchedule(value, projectId);
        const connection = await value.server.hocuspocus.openDirectConnection(`projects/${projectId}`);
        const missing = new Y.Map<unknown>();
        missing.set("name", "Missing source");
        missing.set("sqlName", "missing_source");
        connection.document.getMap("yjsTables").set("missing-table", missing);
        const rule = connection.document.getMap<Y.Map<unknown>>("schedules").get("typed-rule");
        if (!rule) throw new Error("typed Schedule was not persisted");
        rule.set("sql", "INSERT INTO typed_output SELECT id, state FROM missing_source RETURNING *");
        connection.disconnect();

        const run = await value.scheduler.runRuleNow(`projects/${projectId}`, "typed-rule");
        expect(run.success).to.equal(false);
        expect(run.error).to.match(/missing_source|unavailable/i);
        expect(await records(value, projectId)).to.deep.equal({});
    });

    it("refuses the whole returned batch when one ENUM label is invalid", async () => {
        const projectId = "schedule-catalog-invalid-label";
        await seedCatalogSchedule(value, projectId);
        const executor = (value.scheduler as unknown as {
            executor: { executeJob: (job: JobData) => Promise<JobResult>; };
        }).executor;
        const execute = executor.executeJob.bind(executor);
        // Preserve the real worker calculation and corrupt only its provider
        // response, proving the scheduler's authoritative all-or-nothing Yjs
        // boundary rejects a mixed batch rather than trusting worker metadata.
        executor.executeJob = async job => {
            const completed = await execute(job);
            if (!completed.rows) throw new Error(completed.error ?? "worker returned no rows");
            completed.rows[1].state = "not-a-label";
            return completed;
        };

        const run = await value.scheduler.runRuleNow(`projects/${projectId}`, "typed-rule");
        expect(run).to.deep.include({ success: false, error: "Invalid ENUM label in Schedule result" });
        expect(await records(value, projectId)).to.deep.equal({});
    });

    it("refuses a catalog changed after worker calculation and permits a later current run", async () => {
        const projectId = "schedule-catalog-stale";
        await seedCatalogSchedule(value, projectId);
        const executor = (value.scheduler as unknown as {
            executor: { executeJob: (job: JobData) => Promise<JobResult>; };
        }).executor;
        const execute = executor.executeJob.bind(executor);
        let intervened = false;
        // This wrapper is the controlled post-calculation/pre-publication
        // barrier: the actual worker completes first, then the production
        // catalog service publishes the intervention before Scheduler receives
        // the captured result and attempts its final Yjs write-back.
        executor.executeJob = async job => {
            const completed = await execute(job);
            if (!intervened) {
                intervened = true;
                const catalog = catalogService(value);
                const current = await catalog.read(UID, projectId);
                const changed = await catalog.apply(UID, projectId, {
                    expectedRevision: current.revision,
                    intent: {
                        operation: "replace",
                        object: {
                            id: "enum-state",
                            kind: "enum",
                            source: `CREATE TYPE ${TYPE_NAME} AS ENUM ('second', '', 'first')`,
                        },
                    },
                });
                expect(changed.status).to.equal("applied");
            }
            return completed;
        };

        const stale = await value.scheduler.runRuleNow(`projects/${projectId}`, "typed-rule");
        expect(stale).to.deep.include({ success: false });
        expect(stale.error).to.match(/stale-catalog\/schema/);
        expect(await records(value, projectId)).to.deep.equal({});
        expect(await storedRule(value, projectId)).to.include({ lastRunStatus: "error" });

        const current = await value.scheduler.runRuleNow(`projects/${projectId}`, "typed-rule");
        expect(current.success, current.error).to.equal(true);
        expect((await records(value, projectId)).label.state).to.equal("second");
    });
});
