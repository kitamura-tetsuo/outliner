import { expect } from "chai";
import { JobExecutor } from "../../src/scheduler/executor.js";

// Jobs share one PGlite instance inside the worker, so a rule must not be able
// to leave anything behind for the next project's job. A rule's SQL is authored
// per project and can name schemas other than its own, so the per-job schema is
// not by itself an isolation boundary.
describe("Job executor isolation between jobs", function() {
    this.timeout(60000);

    let executor: JobExecutor;

    before(function() {
        executor = new JobExecutor();
        executor.startWorker();
    });

    after(async function() {
        await executor.stopWorker();
    });

    const run = (ruleId: string, ruleSql: string) =>
        executor.executeJob({
            ruleId,
            schemaSql: "CREATE TABLE t (id int);",
            ruleSql,
            records: [],
            timezone: "UTC",
            occurrenceUtcIso: "2026-03-05T00:00:00Z",
        });

    it("discards a table a rule created outside its own schema", async function() {
        const leak = await run("leaking-rule", "CREATE TABLE public.leaked_rows AS SELECT 1 AS n;");
        expect(leak.success, leak.error).to.equal(true);

        // A later job, standing in for another project, must not see it.
        const observer = await run(
            "observing-rule",
            "SELECT to_regclass('public.leaked_rows') IS NOT NULL AS leaked;",
        );

        expect(observer.success, observer.error).to.equal(true);
        expect(observer.rows[0].leaked, "the previous job's table is gone").to.equal(false);
    });

    it("discards a relation the previous run of the same rule created", async function() {
        const first = await run("writer-rule", "CREATE TABLE t2 AS SELECT 1 AS id;");
        expect(first.success, first.error).to.equal(true);

        const second = await run("writer-rule", "SELECT to_regclass('t2') IS NOT NULL AS survived;");

        expect(second.success, second.error).to.equal(true);
        expect(second.rows[0].survived, "the earlier run left no relation behind").to.equal(false);
    });

    it("does not carry a session setting from one job into the next", async function() {
        const first = await run("setting-rule", "SET search_path TO pg_catalog;");
        expect(first.success, first.error).to.equal(true);

        // The next job must still resolve unqualified names in its own schema.
        const second = await run("reading-rule", "SELECT current_schema() AS schema;");

        expect(second.success, second.error).to.equal(true);
        expect(second.rows[0].schema).to.equal("t_reading_rule");
    });

    it("still runs jobs after a rule leaves its transaction in an aborted state", async function() {
        const failed = await run("aborting-rule", "SELECT * FROM definitely_not_here;");
        expect(failed.success).to.equal(false);

        const after = await run("healthy-rule", "SELECT 1 AS ok;");

        expect(after.success, after.error).to.equal(true);
        expect(after.rows).to.deep.equal([{ ok: 1 }]);
    });
});
