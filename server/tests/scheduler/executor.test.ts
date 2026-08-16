import { expect } from "chai";
import { JobExecutor } from "../../src/scheduler/executor.js";

describe("JobExecutor timeout recovery", function() {
    let executor: JobExecutor;

    beforeEach(function() {
        executor = new JobExecutor();
        executor.startWorker();
    });

    afterEach(async function() {
        await executor.stopWorker();
    });

    this.timeout(60000); // 20 seconds to allow for 10s timeout plus overhead in slow CI environments
    it("recovers from a job timeout and executes the next job", async function() {
        const timeoutJobData = {
            schemaSql: "CREATE TABLE t (id INT);",
            ruleSql: "SELECT pg_sleep(21);", // Sleep for 11 seconds to trigger the 10s timeout
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

    it("rejects a job that was still awaiting the worker when shutdown began", async function() {
        // The job suspends on the pending spawn, so stopWorker()'s pass over
        // the outstanding jobs happens before this one can register itself. It
        // must not be left posting into a terminated worker and hanging until
        // its 20s timeout.
        const pending = executor.executeJob({
            schemaSql: "CREATE TABLE t (id INT);",
            ruleSql: "SELECT 1 as result;",
            records: [],
            timezone: "UTC",
            occurrenceUtcIso: "2023-01-01T00:00:00Z",
            ruleId: "shutdown-race-rule",
        });
        await executor.stopWorker();

        let rejection: Error | undefined;
        try {
            await pending;
        } catch (e) {
            rejection = e as Error;
        }

        expect(rejection, "the job settles instead of hanging").to.be.instanceOf(Error);
        expect(rejection?.message).to.equal("Worker terminated");
    });
});
