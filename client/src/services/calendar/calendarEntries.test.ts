import { Items, Project } from "../../schema/app-schema";

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
            "UTC",
        );
        expect(entry.key).toBe("item:abc");
        expect(entry.title).toBe("Standup");
        expect(entry.allDay).toBe(false);
        expect(entry.startMs).toBe(Date.parse("2026-03-16T09:00:00.000Z"));
        expect(entry.durationMs).toBe(30 * 60 * 1000);
    });

    it("builds an all-day entry, parsing the floating date as midnight in the calendar's zone", () => {
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
            "UTC",
        );
        expect(entry.allDay).toBe(true);
        expect(entry.startMs).toBe(Date.parse("2026-08-01T00:00:00Z"));
    });

    // An all-day entry is a floating date (§6.1) and only becomes an instant
    // once a zone is chosen — the view's (§6.5). Anchoring it at UTC midnight
    // instead left `startMs` misaligned with the grid range, which
    // `calendarGridRange.ts` computes at the zone's own midnight, so
    // `layoutMonthGrid` placed a one-day entry in two adjacent day cells.
    it("resolves an all-day floating date against the calendar's zone, not UTC", () => {
        const row = {
            columns: ["title", "start", "all_day", "source_kind", "source_id"],
            rows: [{ title: "Conference", start: "2026-08-01", all_day: true, source_kind: "item", source_id: "xyz" }],
        };

        const [tokyo] = buildCalendarEntries(row, SETTINGS, "Asia/Tokyo");
        expect(tokyo.startMs).toBe(Date.parse("2026-07-31T15:00:00Z"));

        const [newYork] = buildCalendarEntries(row, SETTINGS, "America/New_York");
        expect(newYork.startMs).toBe(Date.parse("2026-08-01T04:00:00Z"));
    });

    it("resolves a bare due date against the calendar's zone, but leaves a due instant alone", () => {
        const [floating] = buildCalendarEntries(
            {
                columns: ["title", "due", "source_kind", "source_id"],
                rows: [{ title: "File taxes", due: "2026-04-15", source_kind: "item", source_id: "d2" }],
            },
            SETTINGS,
            "Asia/Tokyo",
        );
        expect(floating.dueMs).toBe(Date.parse("2026-04-14T15:00:00Z"));

        const [instant] = buildCalendarEntries(
            {
                columns: ["title", "due", "source_kind", "source_id"],
                rows: [{ title: "File taxes", due: "2026-04-15T09:00:00.000Z", source_kind: "item", source_id: "d3" }],
            },
            SETTINGS,
            "Asia/Tokyo",
        );
        expect(instant.dueMs).toBe(Date.parse("2026-04-15T09:00:00.000Z"));
    });

    it("builds a due-only entry with no start", () => {
        const [entry] = buildCalendarEntries(
            {
                columns: ["title", "due", "source_kind", "source_id"],
                rows: [{ title: "File taxes", due: "2026-04-15T00:00:00.000Z", source_kind: "item", source_id: "d1" }],
            },
            SETTINGS,
            "UTC",
        );
        expect(entry.startMs).toBeUndefined();
        expect(entry.dueMs).toBe(Date.parse("2026-04-15T00:00:00.000Z"));
    });

    it("falls back to a bare id column for its key when there is no source_kind/source_id", () => {
        const [entry] = buildCalendarEntries(
            { columns: ["id", "title"], rows: [{ id: "row-1", title: "Untracked" }] },
            SETTINGS,
            "UTC",
        );
        expect(entry.key).toBe("row-1");
        expect(entry.sourceKind).toBeUndefined();
    });

    it("falls back to a row-index key as a last resort", () => {
        const [entry] = buildCalendarEntries(
            { columns: ["title"], rows: [{ title: "No identity" }] },
            SETTINGS,
            "UTC",
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
            "UTC",
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
            "UTC",
        );
        expect(entry.parentId).toBe("parent-1");
    });

    it("leaves parentId undefined when the query does not select parent_id", () => {
        const [entry] = buildCalendarEntries(
            {
                columns: ["title", "source_kind", "source_id"],
                rows: [{ title: "Root", source_kind: "item", source_id: "r1" }],
            },
            SETTINGS,
            "UTC",
        );
        expect(entry.parentId).toBeUndefined();
    });

    it("reads recurrence_parent_id/recurrence_occurrence_id structurally, regardless of role assignment", () => {
        const [entry] = buildCalendarEntries(
            {
                columns: [
                    "title",
                    "start",
                    "source_kind",
                    "source_id",
                    "recurrence_parent_id",
                    "recurrence_occurrence_id",
                ],
                rows: [{
                    title: "Standup (moved)",
                    start: "2026-03-16T10:00:00.000Z",
                    source_kind: "item",
                    source_id: "override-1",
                    recurrence_parent_id: "series-item-id",
                    recurrence_occurrence_id: "2026-03-16T09:00:00",
                }],
            },
            SETTINGS,
            "UTC",
        );
        expect(entry.recurrenceParentId).toBe("series-item-id");
        expect(entry.recurrenceOccurrenceId).toBe("2026-03-16T09:00:00");
    });

    it("leaves recurrence fields undefined when the row does not carry them", () => {
        const [entry] = buildCalendarEntries(
            {
                columns: ["title", "source_kind", "source_id"],
                rows: [{ title: "Plain", source_kind: "item", source_id: "p1" }],
            },
            SETTINGS,
            "UTC",
        );
        expect(entry.recurrenceParentId).toBeUndefined();
        expect(entry.recurrenceOccurrenceId).toBeUndefined();
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
            "UTC",
        );
        expect(entry.startMs).toBeUndefined();
        expect(entry.allDay).toBeUndefined();
        expect(entry.durationMs).toBeUndefined();
        expect(entry.dueMs).toBeUndefined();
    });

    it("expands a recurring item row into virtual occurrences within queryRange", () => {
        const project = Project.createInstance("test");
        const items = new Items(project.ydoc, project.tree, "root");
        const source = items.addNode("author");
        source.text = "Standup";
        source.rrule = "FREQ=WEEKLY;BYDAY=MO;COUNT=2";
        source.recurrenceDtstart = "2026-08-03T09:00:00";
        source.recurrenceTimezone = "UTC";
        source.duration = "PT30M";

        const row = {
            source_kind: "items",
            source_id: source.key,
            text: "Standup",
            rrule: "FREQ=WEEKLY;BYDAY=MO;COUNT=2",
            recurrence_dtstart: "2026-08-03T09:00:00",
            recurrence_timezone: "UTC",
        };

        const range = {
            startUtcMs: Date.parse("2026-08-01T00:00:00Z"),
            endUtcMs: Date.parse("2026-08-31T00:00:00Z"),
        };

        const entries = buildCalendarEntries(
            { columns: ["source_kind", "source_id", "text", "rrule"], rows: [row] },
            { roleTitle: "text" },
            "UTC",
            project,
            range,
        );

        expect(entries).toHaveLength(2);
        expect(entries[0].title).toBe("Standup");
        expect(entries[0].startMs).toBe(Date.parse("2026-08-03T09:00:00Z"));
        expect(entries[1].title).toBe("Standup");
        expect(entries[1].startMs).toBe(Date.parse("2026-08-10T09:00:00Z"));
    });

    it("expands recurrence for every source-kind literal that names the outline relation", () => {
        // The reserved relation name is `outline_items`, and the shipped
        // example queries alias it to `item`; keying expansion on the bare
        // `items` spelling alone left those rows as a single anchor.
        for (const sourceKind of ["outline_items", "item"]) {
            const project = Project.createInstance("test");
            const items = new Items(project.ydoc, project.tree, "root");
            const source = items.addNode("author");
            source.text = "Standup";
            source.rrule = "FREQ=WEEKLY;BYDAY=MO;COUNT=2";
            source.recurrenceDtstart = "2026-08-03T09:00:00";
            source.recurrenceTimezone = "UTC";
            source.duration = "PT30M";

            const entries = buildCalendarEntries(
                {
                    columns: ["source_kind", "source_id", "text", "rrule"],
                    rows: [{
                        source_kind: sourceKind,
                        source_id: source.key,
                        text: "Standup",
                        rrule: "FREQ=WEEKLY;BYDAY=MO;COUNT=2",
                    }],
                },
                { roleTitle: "text" },
                "UTC",
                project,
                { startUtcMs: Date.parse("2026-08-01T00:00:00Z"), endUtcMs: Date.parse("2026-08-31T00:00:00Z") },
            );

            expect(entries.map((e) => e.startMs), sourceKind).toEqual([
                Date.parse("2026-08-03T09:00:00Z"),
                Date.parse("2026-08-10T09:00:00Z"),
            ]);
            // One key per occurrence: two occurrences of one source item must
            // never collapse onto the same entry key.
            expect(new Set(entries.map((e) => e.key)).size).toBe(2);
        }
    });

    it("leaves a recurring row from a foreign relation unexpanded", () => {
        const project = Project.createInstance("test");
        const items = new Items(project.ydoc, project.tree, "root");
        const source = items.addNode("author");
        source.rrule = "FREQ=WEEKLY;BYDAY=MO;COUNT=2";
        source.recurrenceDtstart = "2026-08-03T09:00:00";
        source.recurrenceTimezone = "UTC";

        const entries = buildCalendarEntries(
            {
                columns: ["source_kind", "source_id", "text", "rrule"],
                rows: [{
                    source_kind: "tasks",
                    source_id: source.key,
                    text: "Standup",
                    rrule: "FREQ=WEEKLY;BYDAY=MO;COUNT=2",
                }],
            },
            { roleTitle: "text" },
            "UTC",
            project,
            { startUtcMs: Date.parse("2026-08-01T00:00:00Z"), endUtcMs: Date.parse("2026-08-31T00:00:00Z") },
        );

        expect(entries).toHaveLength(1);
    });
});
