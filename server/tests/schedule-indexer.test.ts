import Database from "better-sqlite3";
import { expect } from "chai";
import * as Y from "yjs";
import {
    computeNextRunAt,
    handleStoreDocumentForSchedules,
    initializeScheduleIndex,
} from "../src/scheduler/schedule-indexer.js";

describe("Schedule Indexer", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = new Database(":memory:");
        initializeScheduleIndex(db);
    });

    afterEach(() => {
        db.close();
    });

    describe("computeNextRunAt", () => {
        it("should correctly compute next run at for a simple daily rule", () => {
            const result = computeNextRunAt(
                "FREQ=DAILY;COUNT=3",
                "2024-01-01T10:00:00",
                "America/New_York",
                0,
            );
            expect(result.state).to.equal("active");
            expect(result.next_run_at).to.equal("2024-01-01T15:00:00.000Z"); // EST is UTC-5
        });

        it("should handle exhausted rules", () => {
            const result = computeNextRunAt(
                "FREQ=DAILY;COUNT=1",
                "2024-01-01T10:00:00",
                "America/New_York",
                1, // seq = 1, meaning the first (and only) run is already consumed
            );
            expect(result.state).to.equal("exhausted");
            expect(result.next_run_at).to.be.null;
        });

        it("should handle invalid rrule", () => {
            const result = computeNextRunAt(
                "INVALID_RULE",
                "2024-01-01T10:00:00",
                "America/New_York",
                0,
            );
            expect(result.state).to.equal("invalid");
            expect(result.next_run_at).to.be.null;
            expect(result.error).to.not.be.undefined;
        });

        it("should handle DST transition correctly (Fall Back)", () => {
            // Nov 3, 2024 is fall back in US
            // 1:00 AM happens twice.
            const result = computeNextRunAt(
                "FREQ=DAILY;COUNT=1",
                "2024-11-03T01:30:00",
                "America/New_York",
                0,
            );
            // Luxon resolves ambiguous times to the first one (EDT, UTC-4) by default
            expect(result.state).to.equal("active");
            expect(result.next_run_at).to.equal("2024-11-03T05:30:00.000Z");
        });

        it("should handle DST transition correctly (Spring Forward)", () => {
            // Mar 10, 2024 is spring forward in US
            // 2:00 AM -> 3:00 AM is skipped
            const result = computeNextRunAt(
                "FREQ=DAILY;COUNT=1",
                "2024-03-10T02:30:00",
                "America/New_York",
                0,
            );
            expect(result.state).to.equal("invalid"); // Invalid dtstart because time doesn't exist
            expect(result.next_run_at).to.be.null;
        });
    });

    describe("handleStoreDocumentForSchedules", () => {
        let doc: Y.Doc;
        let schedulesMap: Y.Map<any>;

        beforeEach(() => {
            doc = new Y.Doc();
            schedulesMap = doc.getMap("schedules");
        });

        it("should insert a new schedule", () => {
            const ruleObj = new Y.Map();
            ruleObj.set("rrule", "FREQ=DAILY;COUNT=3");
            ruleObj.set("dtstart", "2024-01-01T10:00:00");
            ruleObj.set("timezone", "UTC");
            ruleObj.set("targetTableId", "table-1");
            ruleObj.set("sql", "SELECT 1");
            ruleObj.set("enabled", true);
            schedulesMap.set("rule-1", ruleObj);

            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            const row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-1") as any;
            expect(row).to.exist;
            expect(row.room).to.equal("test-room");
            expect(row.rrule).to.equal("FREQ=DAILY;COUNT=3");
            expect(row.state).to.equal("active");
            expect(row.next_run_at).to.equal("2024-01-01T10:00:00.000Z");
        });

        it("should update schedule when targetTableId changes", () => {
            const ruleObj = new Y.Map();
            ruleObj.set("rrule", "FREQ=DAILY;COUNT=3");
            ruleObj.set("dtstart", "2024-01-01T10:00:00");
            ruleObj.set("timezone", "UTC");
            ruleObj.set("targetTableId", "table-1");
            ruleObj.set("sql", "SELECT 1");
            ruleObj.set("enabled", true);
            schedulesMap.set("rule-1", ruleObj);

            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            ruleObj.set("targetTableId", "table-2");
            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            const row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-1") as any;
            expect(row.target_table_id).to.equal("table-2");
        });

        it("should delete a schedule that was removed", () => {
            // First insert
            db.prepare(
                "INSERT INTO schedule_index (room, rule_id, target_table_id, timezone, rrule, dtstart, next_run_at, occurrence_seq, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
                .run(
                    "test-room",
                    "rule-to-delete",
                    "table-1",
                    "UTC",
                    "FREQ=DAILY",
                    "2024-01-01T10:00:00",
                    "2024-01-01T10:00:00Z",
                    0,
                    "active",
                );

            // Empty doc will trigger deletion of existing db record
            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            const row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-to-delete");
            expect(row).to.be.undefined;
        });

        it("should update a schedule if properties change", () => {
            const ruleObj = new Y.Map();
            ruleObj.set("rrule", "FREQ=DAILY;COUNT=3");
            ruleObj.set("dtstart", "2024-01-01T10:00:00");
            ruleObj.set("timezone", "UTC");
            ruleObj.set("sql", "SELECT 1");
            ruleObj.set("enabled", true);
            schedulesMap.set("rule-1", ruleObj);

            // First run
            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            let row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-1") as any;
            expect(row.next_run_at).to.equal("2024-01-01T10:00:00.000Z");

            // Change dtstart
            ruleObj.set("dtstart", "2024-01-02T10:00:00");

            // Second run
            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-1") as any;
            expect(row.next_run_at).to.equal("2024-01-02T10:00:00.000Z");
            expect(row.occurrence_seq).to.equal(0); // Sequence reset
        });

        it("should mark as disabled if disabled", () => {
            const ruleObj = new Y.Map();
            ruleObj.set("rrule", "FREQ=DAILY;COUNT=3");
            ruleObj.set("dtstart", "2024-01-01T10:00:00");
            ruleObj.set("timezone", "UTC");
            ruleObj.set("sql", "SELECT 1");
            ruleObj.set("enabled", false);
            schedulesMap.set("rule-1", ruleObj);

            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            const row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-1") as any;
            expect(row.state).to.equal("disabled");
        });

        it("should write back validationError on invalid rule", () => {
            const ruleObj = new Y.Map();
            ruleObj.set("rrule", "INVALID");
            ruleObj.set("dtstart", "2024-01-01T10:00:00");
            ruleObj.set("timezone", "UTC");
            ruleObj.set("sql", "SELECT 1");
            ruleObj.set("enabled", true);
            schedulesMap.set("rule-1", ruleObj);

            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            const row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-1") as any;
            expect(row.state).to.equal("invalid");
            expect(ruleObj.get("validationError")).to.not.be.undefined;
        });

        it("should write back completedAt on exhausted rule", () => {
            // We can exhaust the rule simply by creating an existing rule in db with seq = 1
            // and triggering the handleStoreDocumentForSchedules with the same rule
            // However, our code checks if things CHANGED. If they didn't change, we skip.
            // We need something to trigger the computation with seq=1, or we just manually update sequence?
            // Actually, the indexer logic: if it's in DB and properties match, it uses db seq.
            // If properties don't match, seq is 0.
            // We CAN trigger it to use seq=1 by putting it in DB with seq=1, and the properties MATCH.
            // Wait, if it matches, and it's enabled, it says: `return; // Nothing changed, active -> active` or similar!
            // Let's modify the indexer to recompute if it's not disabled/exhausted but we need to run it?
            // No, the indexer only recomputes on property CHANGE!
            // Wait, the specification says: "Recompute next_run_at when any of rrule, dtstart, timezone, enabled changed."
            // AND we also need to recompute when it runs. When the EXECUTOR runs it, it increments the sequence.
            // Here, we just want to test exhaustion during property change.

            // If we insert seq=1 into DB, and change a property, seq RESETS to 0. So it won't be exhausted.
            // Wait, a COUNT=1 rule is exhausted at seq=1.
            // If the client sets COUNT=0 (which is invalid according to rfc but let's test COUNT=1 with seq=1).
            // To test this: how does seq become 1 in our test without resetting?
            // If the user changes `enabled` from `false` to `true`, and it was at seq=1!

            db.prepare(
                "INSERT INTO schedule_index (room, rule_id, target_table_id, timezone, rrule, dtstart, next_run_at, occurrence_seq, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
                .run(
                    "test-room",
                    "rule-1",
                    "table-1",
                    "UTC",
                    "FREQ=DAILY;COUNT=1",
                    "2024-01-01T10:00:00",
                    null,
                    1,
                    "disabled",
                );

            const ruleObj = new Y.Map();
            ruleObj.set("rrule", "FREQ=DAILY;COUNT=1");
            ruleObj.set("dtstart", "2024-01-01T10:00:00");
            ruleObj.set("timezone", "UTC");
            ruleObj.set("sql", "SELECT 1");
            ruleObj.set("enabled", true); // Trigger active transition which recomputes using seq=1!
            schedulesMap.set("rule-1", ruleObj);

            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            const row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-1") as any;
            expect(row.state).to.equal("exhausted");
            expect(ruleObj.get("completedAt")).to.not.be.undefined;
        });

        // A rule without `sql` can never be executed by the scheduler, so the
        // indexer must not track it (and must garbage-collect a stale row that
        // the scheduler already marked as orphaned).
        it("should not index a rule without sql and should drop its stale row", () => {
            db.prepare(
                "INSERT INTO schedule_index (room, rule_id, target_table_id, timezone, rrule, dtstart, next_run_at, occurrence_seq, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
                .run(
                    "test-room",
                    "rule-1",
                    "table-1",
                    "UTC",
                    "FREQ=DAILY",
                    "2024-01-01T10:00:00",
                    "2024-01-01T10:00:00.000Z",
                    0,
                    "orphaned",
                );

            const ruleObj = new Y.Map();
            ruleObj.set("rrule", "FREQ=DAILY;COUNT=3");
            ruleObj.set("dtstart", "2024-01-01T10:00:00");
            ruleObj.set("timezone", "UTC");
            ruleObj.set("targetTableId", "table-1");
            ruleObj.set("enabled", true);
            schedulesMap.set("rule-1", ruleObj);

            handleStoreDocumentForSchedules({ documentName: "test-room", document: doc } as any, db);

            const row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = ?").get("rule-1");
            expect(row).to.be.undefined;
        });
    });
});
