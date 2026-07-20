import { expect } from "chai";
import sinon from "sinon";
import { executeJob } from "../../src/scheduler/job-executor.js";

describe("Job Executor", () => {
    it("should execute a valid job and return rows", async () => {
        try {
            const job = {
                ruleId: "r1",
                schemaSql: 'CREATE TABLE t1 (id TEXT PRIMARY KEY, val INTEGER);',
                records: [{ id: "1", val: 10 }, { id: "2", val: 20 }],
                ruleSql: 'UPDATE t1 SET val = val + 1 RETURNING *;',
                timezone: 'UTC',
                occurrenceIso: '2025-01-01T00:00:00.000Z'
            };
            const result = await executeJob(job);
            if (!result.success) {
                console.error("Result error: ", result.error);
            }
            expect(result.success).to.be.true;
            expect(result.rows).to.have.length(2);
            expect(result.rows![0].val).to.equal(11);
        } catch (e) {
            console.error("Error: ", e);
            throw e;
        }
    }, 15000);

    it("should timeout if the job takes too long", async () => {
        const job = {
            ruleId: "r1",
            schemaSql: 'CREATE TABLE t1 (id TEXT PRIMARY KEY, val INTEGER);',
            records: [],
            ruleSql: 'SELECT pg_sleep(0.5);',
            timezone: 'UTC',
            occurrenceIso: '2025-01-01T00:00:00.000Z'
        };
        const result = await executeJob(job, 100);
        expect(result.success).to.be.false;
        expect(result.error).to.equal("Job timed out");
    });
});
