import Database from "better-sqlite3";
import { expect } from "chai";
import { Settings } from "luxon";
import * as Y from "yjs";
import {
    computeNextRunAt,
    computeOccurrencesAfter,
    handleStoreDocumentForSchedules,
    initializeScheduleIndex,
} from "../src/scheduler/schedule-indexer.js";

// Literal UTC oracles implement #5859's existing earlier-instant policy.
// Luxon's actual clock is controlled and restored, never the calculation.
describe("Schedule earlier-instant policy (#5859)", () => {
    let previousNow: typeof Settings.now;
    beforeEach(() => {
        previousNow = Settings.now;
    });
    afterEach(() => {
        Settings.now = previousNow;
        Settings.resetCaches();
    });

    for (const now of ["2026-01-15T12:00:00.000Z", "2026-07-15T12:00:00.000Z"]) {
        describe(`while the execution clock is ${now}`, () => {
            beforeEach(() => {
                Settings.now = () => Date.parse(now);
                Settings.resetCaches();
            });

            it("selects the earlier fall-back instant", () => {
                const result = computeNextRunAt(
                    "FREQ=DAILY;COUNT=1",
                    "2024-11-03T01:30:00",
                    "America/New_York",
                    0,
                );
                expect(result).to.deep.equal({
                    state: "active",
                    next_run_at: "2024-11-03T05:30:00.000Z",
                    nextSeq: 0,
                });
            });

            it("persists that instant through the real Schedule document store hook", () => {
                const db = new Database(":memory:");
                const document = new Y.Doc();
                try {
                    initializeScheduleIndex(db);
                    const rule = new Y.Map<unknown>();
                    rule.set("rrule", "FREQ=DAILY;COUNT=1");
                    rule.set("dtstart", "2024-11-03T01:30:00");
                    rule.set("timezone", "America/New_York");
                    rule.set("targetTableId", "table-1");
                    rule.set("sql", "SELECT 1");
                    rule.set("enabled", true);
                    document.getMap("schedules").set("fall-back", rule);
                    handleStoreDocumentForSchedules(
                        { documentName: "dst-room", document } as Parameters<typeof handleStoreDocumentForSchedules>[0],
                        db,
                    );
                    const row = db.prepare(
                        "SELECT state, next_run_at, occurrence_seq FROM schedule_index WHERE room = ? AND rule_id = ?",
                    ).get("dst-room", "fall-back");
                    expect(row).to.deep.equal({
                        state: "active",
                        next_run_at: "2024-11-03T05:30:00.000Z",
                        occurrence_seq: 0,
                    });
                } finally {
                    document.destroy();
                    db.close();
                }
            });

            it("uses the same instant in occurrence expansion", () => {
                expect(computeOccurrencesAfter(
                    "FREQ=DAILY;COUNT=1",
                    "2024-11-03T01:30:00",
                    "America/New_York",
                    Date.parse("2024-11-03T05:00:00.000Z"),
                    1,
                )).to.deep.equal(["2024-11-03T05:30:00.000Z"]);
            });

            it("does not resurrect the later fold after the earlier instant passed", () => {
                expect(computeOccurrencesAfter(
                    "FREQ=DAILY;COUNT=1",
                    "2024-11-03T01:30:00",
                    "America/New_York",
                    Date.parse("2024-11-03T05:45:00.000Z"),
                    1,
                )).to.deep.equal([]);
            });

            for (
                const [cursor, expected] of [
                    [0, "2024-11-02T05:30:00.000Z"],
                    [1, "2024-11-03T05:30:00.000Z"],
                    [2, "2024-11-04T06:30:00.000Z"],
                ] as const
            ) {
                it(`preserves ordinary recurrence and cursor ${cursor}`, () => {
                    expect(computeNextRunAt(
                        "FREQ=DAILY;COUNT=3",
                        "2024-11-02T01:30:00",
                        "America/New_York",
                        cursor,
                    )).to.deep.equal({ state: "active", next_run_at: expected, nextSeq: cursor });
                });
            }
        });
    }
});
