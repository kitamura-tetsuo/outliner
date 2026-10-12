import { expect } from "chai";
import { JobExecutor } from "../../src/scheduler/executor.js";

describe("Job executor", function() {
    this.timeout(60000);
    let executor: JobExecutor;

    // One worker for the whole file: each job runs in its own Postgres schema,
    // so the tests stay isolated without paying a WASM startup per test.
    before(function() {
        executor = new JobExecutor();
        executor.startWorker();
    });

    after(async function() {
        await executor.stopWorker();
    });

    it("should bulk load records and handle timezone", async function() {
        const result = await executor.executeJob({
            ruleId: "test-rule-3",
            schemaSql: "CREATE TABLE test (id int, name text);",
            ruleSql: "SELECT name FROM test WHERE id = 2;",
            records: [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" },
            ],
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
        });

        expect(result.success).to.be.true;
        expect(result.rows).to.deep.equal([{ name: "Bob" }]);
    });

    it("materializes every table of the job so a rule can read another one", async function() {
        // A rule writes into its target table but may query any table of its
        // project (see JobScheduler.loadReferencedTables): each entry of
        // `tables` becomes its own relation, loaded with its own records.
        const result = await executor.executeJob({
            ruleId: "test-rule-multi-table",
            schemaSql: "CREATE TABLE target (id text, label text);",
            ruleSql: "INSERT INTO target (id, label) SELECT s.id, s.label FROM source s RETURNING *;",
            records: [],
            tables: [
                { schemaSql: "CREATE TABLE target (id text, label text);", records: [] },
                {
                    schemaSql: "CREATE TABLE source (id text, label text);",
                    records: [{ id: "a", label: "from the other table" }],
                },
            ],
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
        });

        expect(result.success, result.error).to.be.true;
        expect(result.rows).to.deep.equal([{ id: "a", label: "from the other table" }]);
    });

    it("reconstructs each captured ENUM catalog without leaking worker state", async function() {
        const run = (labels: string) =>
            executor.executeJob({
                ruleId: "catalog-isolation",
                schemaSql: "CREATE TABLE target (id text, value int_like_state);",
                ruleSql: "INSERT INTO target VALUES ('row', 'second') RETURNING *;",
                catalog: {
                    projectId: labels,
                    format: 1,
                    revision: labels,
                    objects: [{ id: "state", kind: "enum", source: `CREATE TYPE int_like_state AS ENUM (${labels})` }],
                },
                tableSnapshots: [{
                    id: "target",
                    schema: "CREATE TABLE target (id text, value int_like_state);",
                    records: [],
                }],
                targetTableId: "target",
                timezone: "UTC",
                occurrenceUtcIso: "2023-01-01T00:00:00Z",
            });

        const first = await run("'first', 'second'");
        const second = await run("'second', 'first'");
        expect(first.success, first.error).to.equal(true);
        expect(second.success, second.error).to.equal(true);
        expect(first.rows).to.deep.equal([{ id: "row", value: "second" }]);
        expect(second.enumColumns).to.deep.equal({ value: ["second", "first"] });
    });

    it("fails the complete job when a captured catalog dependency is unavailable", async function() {
        const result = await executor.executeJob({
            ruleId: "missing-enum",
            schemaSql: "CREATE TABLE target (id text, value missing_state);",
            ruleSql: "SELECT * FROM target;",
            catalog: { projectId: "missing", format: 1, revision: "missing", objects: [] },
            tableSnapshots: [{
                id: "target",
                schema: "CREATE TABLE target (id text, value missing_state);",
                records: [],
            }],
            targetTableId: "target",
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
        });
        expect(result.success).to.equal(false);
        expect(result.error).to.contain("Schedule environment unavailable");
        expect(result.rows).to.equal(undefined);
    });

    it("should correctly handle heterogeneous records based on schema", async function() {
        const result = await executor.executeJob({
            ruleId: "test-rule-hetero",
            schemaSql: "CREATE TABLE test (id int, name text, age int);",
            ruleSql: "SELECT id, name, age FROM test ORDER BY id;",
            records: [
                { id: 1, name: "Alice" }, // Missing age
                { id: 2, age: 30 }, // Missing name
                { id: 3, name: "Charlie", age: 25, extra: "ignore me" }, // Has extra field
            ],
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
        });

        expect(result.success).to.be.true;
        expect(result.rows).to.deep.equal([
            { id: 1, name: "Alice", age: null },
            { id: 2, name: null, age: 30 },
            { id: 3, name: "Charlie", age: 25 },
        ]);
    });
});
