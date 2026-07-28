import { describe, expect, it } from "vitest";
import { buildCalendarEntries } from "./calendarEntries";

const SETTINGS = {
    roleTitle: "title",
    roleStart: "start",
    roleAllDay: "all_day",
    roleDuration: "duration",
    roleDue: "due",
};

describe("buildCalendarEntries", () => {
    it("builds a timed entry with an instant start", () => {
        const [entry] = buildCalendarEntries(
            {
                columns: ["title", "start", "all_day", "duration", "source_kind", "source_id"],
                rows: [{
                    title: "Standup",
                    start: "2026-03-16T09:00:00.000Z",
                    all_day: false,
                    duration: "00:30:00",
                    source_kind: "item",
                    source_id: "abc",
                }],
            },
            SETTINGS,
        );
        expect(entry.key).toBe("item:abc");
        expect(entry.title).toBe("Standup");
        expect(entry.allDay).toBe(false);
        expect(entry.startMs).toBe(Date.parse("2026-03-16T09:00:00.000Z"));
        expect(entry.durationMs).toBe(30 * 60 * 1000);
    });

    it("builds an all-day entry, parsing the floating date as UTC midnight", () => {
        const [entry] = buildCalendarEntries(
            {
                columns: ["title", "start", "all_day", "source_kind", "source_id"],
                rows: [{
                    title: "Conference",
                    start: "2026-08-01",
                    all_day: true,
                    source_kind: "item",
                    source_id: "xyz",
                }],
            },
            SETTINGS,
        );
        expect(entry.allDay).toBe(true);
        expect(entry.startMs).toBe(Date.parse("2026-08-01T00:00:00Z"));
    });

    it("builds a due-only entry with no start", () => {
        const [entry] = buildCalendarEntries(
            {
                columns: ["title", "due", "source_kind", "source_id"],
                rows: [{ title: "File taxes", due: "2026-04-15T00:00:00.000Z", source_kind: "item", source_id: "d1" }],
            },
            SETTINGS,
        );
        expect(entry.startMs).toBeUndefined();
        expect(entry.dueMs).toBe(Date.parse("2026-04-15T00:00:00.000Z"));
    });

    it("falls back to a bare id column for its key when there is no source_kind/source_id", () => {
        const [entry] = buildCalendarEntries(
            { columns: ["id", "title"], rows: [{ id: "row-1", title: "Untracked" }] },
            SETTINGS,
        );
        expect(entry.key).toBe("row-1");
        expect(entry.sourceKind).toBeUndefined();
    });

    it("falls back to a row-index key as a last resort", () => {
        const [entry] = buildCalendarEntries(
            { columns: ["title"], rows: [{ title: "No identity" }] },
            SETTINGS,
        );
        expect(entry.key).toBe("row:0");
    });

    it("treats a boolean-typed Postgres boolean and its 't'/'f' text form the same", () => {
        const rows = buildCalendarEntries(
            {
                columns: ["title", "start", "all_day"],
                rows: [
                    { title: "A", start: "2026-08-01", all_day: "t" },
                    { title: "B", start: "2026-08-02", all_day: "f" },
                ],
            },
            SETTINGS,
        );
        expect(rows[0].allDay).toBe(true);
        expect(rows[1].allDay).toBe(false);
    });

    it("carries parent_id for Gantt's hierarchy (#4350) when the query selects it", () => {
        const [entry] = buildCalendarEntries(
            {
                columns: ["title", "start", "source_kind", "source_id", "parent_id"],
                rows: [{
                    title: "Subtask",
                    start: "2026-03-16T09:00:00.000Z",
                    source_kind: "item",
                    source_id: "child-1",
                    parent_id: "parent-1",
                }],
            },
            SETTINGS,
        );
        expect(entry.parentId).toBe("parent-1");
    });

    it("leaves parentId undefined when the query does not select parent_id", () => {
        const [entry] = buildCalendarEntries(
            { columns: ["title", "source_kind", "source_id"], rows: [{ title: "Root", source_kind: "item", source_id: "r1" }] },
            SETTINGS,
        );
        expect(entry.parentId).toBeUndefined();
    });

    it("leaves start/allDay/duration undefined when the relevant role is unassigned", () => {
        const [entry] = buildCalendarEntries(
            { columns: ["title"], rows: [{ title: "Bare" }] },
            {
                roleTitle: "title",
                roleStart: undefined,
                roleAllDay: undefined,
                roleDuration: undefined,
                roleDue: undefined,
            },
        );
        expect(entry.startMs).toBeUndefined();
        expect(entry.allDay).toBeUndefined();
        expect(entry.durationMs).toBeUndefined();
        expect(entry.dueMs).toBeUndefined();
    });
});
