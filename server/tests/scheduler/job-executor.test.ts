import { expect } from "chai";
import { JobExecutor } from "../../src/scheduler/executor.js";

describe("Job executor", () => {
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
    }, 15000);

    it("should handle heterogeneous records and ignore missing or extra keys", async () => {
        const result = await executor.executeJob({
            ruleId: "test-heterogeneous",
            schemaSql: "CREATE TABLE test (id int, name text, age int);",
            ruleSql: "SELECT id, name, age FROM test ORDER BY id;",
            records: [
                { id: 1 }, // Missing name and age
                { id: 2, name: "Bob", extra_key: "ignore_me" }, // Missing age, extra key
                { id: 3, name: "Charlie", age: 30 }, // Full record
            ],
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
        });

        expect(result.success).to.be.true;
        expect(result.rows).to.deep.equal([
            { id: 1, name: null, age: null },
            { id: 2, name: "Bob", age: null },
            { id: 3, name: "Charlie", age: 30 },
        ]);
    }, 15000);
});
