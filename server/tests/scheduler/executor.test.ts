import { expect } from "chai";
import { JobExecutor } from "../../src/scheduler/executor.js";

describe("JobExecutor timeout recovery", function() {
    let executor: JobExecutor;

    beforeEach(() => {
        executor = new JobExecutor();
        executor.startWorker();
    });

    afterEach(async () => {
        await executor.stopWorker();
    });

    it("recovers from a job timeout and executes the next job", async function() {
        this.timeout(30000); // 15 seconds to allow for 10s timeout plus overhead

        const timeoutJobData = {
            schemaSql: "CREATE TABLE t (id INT);",
            ruleSql: "SELECT pg_sleep(11);", // Sleep for 11 seconds to trigger the 10s timeout
            records: [],
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
            ruleId: "timeout-rule",
        };

        const normalJobData = {
            schemaSql: "CREATE TABLE t (id INT);",
            ruleSql: "SELECT 1 as result;",
            records: [],
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
            ruleId: "normal-rule",
        };

        // 1. Submit a job that will time out
        let timeoutError: Error | null = null;
        try {
            await executor.executeJob(timeoutJobData);
        } catch (e: any) {
            timeoutError = e;
        }

        expect(timeoutError).to.not.be.null;
        expect(timeoutError?.message).to.equal("Job timeout");

        // 2. Submit a normal job immediately after
        const result = await executor.executeJob(normalJobData);
        expect(result.success).to.be.true;
        expect(result.rows).to.deep.equal([{ result: 1 }]);
    });
});
