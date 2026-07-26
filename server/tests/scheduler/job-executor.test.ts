import { expect } from "chai";
import { JobExecutor } from "../../src/scheduler/executor.js";

describe("Job executor", function () {
    this.timeout(15000);
    let executor: JobExecutor;

    beforeEach(() => {
        executor = new JobExecutor();
        executor.startWorker();
    });

    afterEach(async () => {
        await executor.stopWorker();
    });

    it("should bulk load records and handle timezone", async () => {
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

    it("should correctly handle heterogeneous records based on schema", async () => {
        const result = await executor.executeJob({
            ruleId: "test-rule-hetero",
            schemaSql: "CREATE TABLE test (id int, name text, age int);",
            ruleSql: "SELECT id, name, age FROM test ORDER BY id;",
            records: [
                { id: 1, name: "Alice" }, // Missing age
                { id: 2, age: 30 },       // Missing name
                { id: 3, name: "Charlie", age: 25, extra: "ignore me" }, // Has extra field
            ],
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
        });

        expect(result.success).to.be.true;
        expect(result.rows).to.deep.equal([
            { id: 1, name: "Alice", age: null },
            { id: 2, name: null, age: 30 },
            { id: 3, name: "Charlie", age: 25 }
        ]);
    });
});
