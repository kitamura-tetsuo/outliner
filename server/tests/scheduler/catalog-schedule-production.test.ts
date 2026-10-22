import { expect } from "chai";
import type { JobData, JobResult } from "../../src/scheduler/worker-types.js";
import {
    type CatalogScheduleFixture,
    closeFixture,
    configureTarget,
    fixture,
    records,
    seedCatalogSchedule,
    storedRule,
    TYPE_NAME,
    UID,
} from "./catalog-schedule-fixture.js";

describe("Schedule catalog production path (#5535 REQ-007)", function() {
    this.timeout(120_000);
    let value: CatalogScheduleFixture;

    beforeEach(async () => value = await fixture());
    afterEach(async () => await closeFixture(value));

    it("runs cold through submission, worker and Yjs, with an effect-free matching preview", async () => {
        const projectId = "schedule-catalog-cold";
        await seedCatalogSchedule(value, projectId);
        const beforeRule = await storedRule(value, projectId);

        const stored = await value.schedules.getSchedule(UID, projectId, "typed-rule");
        const preview = await value.schedules.validate(
            UID,
            projectId,
            stored.stored as never,
            "typed-rule",
            "2026-10-11T00:00:00Z",
        );
        expect(preview, JSON.stringify(preview)).to.include({ accepted: true, persisted: false });
        expect(preview.candidateRows).to.deep.equal([
            { id: "label", state: "second" },
            { id: "empty", state: "" },
            { id: "nil", state: null },
        ]);
        expect(await records(value, projectId)).to.deep.equal({});
        expect(await storedRule(value, projectId)).to.deep.equal(beforeRule);

        const run = await value.scheduler.runRuleNow(`projects/${projectId}`, "typed-rule");
        expect(run.success, run.error).to.equal(true);
        expect(await records(value, projectId)).to.deep.equal({
            label: { id: "label", state: "second" },
            empty: { id: "empty", state: "" },
            nil: { id: "nil", state: null },
        });
        expect(TYPE_NAME).to.match(/int.*bool.*num/);
    });

    it("isolates the same type name between projects on the shared worker", async () => {
        await seedCatalogSchedule(value, "schedule-catalog-a", "'first', '', 'second'");
        await seedCatalogSchedule(value, "schedule-catalog-b", "'second', '', 'first'");
        const a = await value.scheduler.runRuleNow("projects/schedule-catalog-a", "typed-rule");
        const b = await value.scheduler.runRuleNow("projects/schedule-catalog-b", "typed-rule");
        expect(a.success, a.error).to.equal(true);
        expect(b.success, b.error).to.equal(true);
        expect((await records(value, "schedule-catalog-a")).label.state).to.equal("second");
        expect((await records(value, "schedule-catalog-b")).label.state).to.equal("second");
    });

    it("hands exact quoted column names and resolved types from the real worker through write-back", async () => {
        const projectId = "schedule-catalog-quoted-columns";
        await seedCatalogSchedule(value, projectId);
        await configureTarget(
            value,
            projectId,
            `CREATE TABLE "typed_output" (
                id TEXT PRIMARY KEY,
                "状態 値" ${TYPE_NAME},
                "a""b" VARCHAR(36),
                amount NUMERIC(10,2),
                enabled BOOLEAN,
                CONSTRAINT amount_nonnegative CHECK (amount >= 0)
            )`,
            `INSERT INTO typed_output (id, "状態 値", "a""b", amount, enabled)
                VALUES ('quoted', 'second', 'Unicode ✓', 12.34, true) RETURNING *`,
        );
        const executor = (value.scheduler as unknown as {
            executor: { executeJob: (job: JobData) => Promise<JobResult>; };
        }).executor;
        const execute = executor.executeJob.bind(executor);
        let targetColumns: JobResult["targetColumns"];
        executor.executeJob = async job => {
            const completed = await execute(job);
            targetColumns = completed.targetColumns;
            return completed;
        };

        const run = await value.scheduler.runRuleNow(`projects/${projectId}`, "typed-rule");
        expect(run.success, run.error).to.equal(true);
        expect(targetColumns).to.deep.equal([
            { name: "id", type: "text" },
            { name: "状態 値", type: TYPE_NAME },
            { name: `a"b`, type: "character varying(36)" },
            { name: "amount", type: "numeric(10,2)" },
            { name: "enabled", type: "boolean" },
        ]);
        expect((await records(value, projectId)).quoted).to.deep.equal({
            id: "quoted",
            "状態 値": "second",
            [`a"b`]: "Unicode ✓",
            amount: 12.34,
            enabled: true,
        });
    });

    for (
        const example of [
            { name: "built-in", type: "INTEGER", defaultValue: "7" },
            { name: "ENUM", type: TYPE_NAME, defaultValue: "'first'" },
        ]
    ) {
        it(`keeps sparse ${example.name} records identical in preview and execution`, async () => {
            const projectId = `schedule-sparse-${example.name.toLowerCase()}`;
            await seedCatalogSchedule(value, projectId);
            await configureTarget(
                value,
                projectId,
                `CREATE TABLE typed_output (id TEXT PRIMARY KEY, state ${example.type} DEFAULT ${example.defaultValue})`,
                "INSERT INTO typed_output (id,state) SELECT 'copy' AS id,state AS state FROM typed_output WHERE id='source' RETURNING *",
                { id: "source" },
            );
            const stored = await value.schedules.getSchedule(UID, projectId, "typed-rule");
            const preview = await value.schedules.validate(UID, projectId, stored.stored as never, "typed-rule");
            expect(preview, JSON.stringify(preview)).to.include({ accepted: true });
            expect(preview.candidateRows).to.deep.equal([{ id: "copy", state: null }]);
            const run = await value.scheduler.runRuleNow(`projects/${projectId}`, "typed-rule");
            expect(run.success, run.error).to.equal(true);
            expect((await records(value, projectId)).copy).to.deep.equal({ id: "copy", state: null });
        });
    }
});
