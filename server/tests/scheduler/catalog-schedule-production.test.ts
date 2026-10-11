import { expect } from "chai";
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
