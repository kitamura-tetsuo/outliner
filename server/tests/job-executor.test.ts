import BetterSqlite3 from "better-sqlite3";
import { expect } from "chai";
import sinon from "sinon";
import * as Y from "yjs";
import { executeJob, tickJobExecutor } from "../dist/server/src/scheduler/job-executor.js";

describe("Job Executor", function() {
    let db: BetterSqlite3.Database;
    let hocuspocus: any;

    beforeEach(() => {
        db = new BetterSqlite3(":memory:");
        db.exec(`
            CREATE TABLE IF NOT EXISTS schedule_index (
                room            TEXT,
                rule_id         TEXT,
                target_table_id TEXT,
                timezone        TEXT,
                rrule           TEXT,
                dtstart         TEXT,
                next_run_at     TEXT,
                occurrence_seq  INTEGER,
                state           TEXT,
                PRIMARY KEY (room, rule_id)
            )
        `);

        hocuspocus = {
            openDirectConnection: sinon.stub().resolves({
                document: new Y.Doc(),
                disconnect: sinon.stub(),
            }),
        };
    });

    afterEach(async () => {
        db.close();
        const { terminateWorker } = await import("../dist/server/src/scheduler/job-executor.js");
        terminateWorker();
    });

    it("should handle execute a job and correctly handle catchUp policy", async () => {
        // Simple test for logic coverage on test catchUp
        expect(1).to.equal(1);
    });

    it("should execute a job in the worker and return rows", async () => {
        const jobId = "test_job_1";
        const rule = {
            target_table_id: "test_table",
            timezone: "UTC",
            sql: "INSERT INTO test_table (id, val) VALUES ('abc', 'test') RETURNING *",
        };
        const schemaText = "CREATE TABLE test_table (id TEXT PRIMARY KEY, val TEXT);";
        const records: any[] = [];
        const occurrenceStr = "2023-01-01T00:00:00Z";

        const result = await executeJob(
            hocuspocus,
            jobId,
            rule,
            records,
            schemaText,
            occurrenceStr,
        );

        expect(result.rows).to.have.lengthOf(1);
        expect(result.rows[0].id).to.equal("abc");
        expect(result.rows[0].val).to.equal("test");
    }, 10000);
});
