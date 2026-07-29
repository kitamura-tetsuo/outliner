import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./calendarEntries";
import { layoutMonthGrid } from "./calendarMonthGridLayout";

const DAY_MS = 86_400_000;
const RANGE_START = Date.parse("2026-02-23T00:00:00Z");
const RANGE_END = RANGE_START + 42 * DAY_MS; // 6-week grid

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
    return { key: "k", title: "t", raw: {}, ...overrides };
}

describe("layoutMonthGrid", () => {
    it("produces one cell per grid day, in order, dated correctly", () => {
        const cells = layoutMonthGrid([], RANGE_START, RANGE_END);
        expect(cells).toHaveLength(42);
        expect(cells[0].dateUtcMs).toBe(RANGE_START);
        expect(cells[1].dateUtcMs).toBe(RANGE_START + DAY_MS);
    });

    it("places a timed entry in the cell of its start day", () => {
        const e = entry({ key: "a", allDay: false, startMs: RANGE_START + 5 * DAY_MS + 3_600_000 });
        const cells = layoutMonthGrid([e], RANGE_START, RANGE_END);
        expect(cells[5].entries).toEqual([{ entry: e, spanDays: 1 }]);
        expect(cells[4].entries).toHaveLength(0);
    });

    it("places an all-day entry in every day cell it covers", () => {
        const e = entry({ key: "a", allDay: true, startMs: RANGE_START + 2 * DAY_MS, durationMs: 3 * DAY_MS });
        const cells = layoutMonthGrid([e], RANGE_START, RANGE_END);
        expect(cells[2].entries).toEqual([{ entry: e, spanDays: 3 }]);
        expect(cells[3].entries).toEqual([{ entry: e, spanDays: 3 }]);
        expect(cells[4].entries).toEqual([{ entry: e, spanDays: 3 }]);
        expect(cells[1].entries).toHaveLength(0);
        expect(cells[5].entries).toHaveLength(0);
    });

    it("clips an all-day entry's cell membership to the visible grid", () => {
        // Spans day -1, 0, 1 relative to the grid; only days 0 and 1 are visible.
        const e = entry({ key: "a", allDay: true, startMs: RANGE_START - DAY_MS, durationMs: 3 * DAY_MS });
        const cells = layoutMonthGrid([e], RANGE_START, RANGE_END);
        expect(cells[0].entries).toEqual([{ entry: e, spanDays: 2 }]);
        expect(cells[1].entries).toEqual([{ entry: e, spanDays: 2 }]);
        expect(cells[2].entries).toHaveLength(0);
    });

    it("places a due-only entry as a milestone in its due day's cell", () => {
        const e = entry({ key: "a", dueMs: RANGE_START + 10 * DAY_MS + 1000 });
        const cells = layoutMonthGrid([e], RANGE_START, RANGE_END);
        expect(cells[10].milestones).toEqual([e]);
        expect(cells[10].entries).toHaveLength(0);
    });

    it("excludes an entry entirely outside the grid", () => {
        const e = entry({ key: "a", allDay: false, startMs: RANGE_END + DAY_MS });
        const cells = layoutMonthGrid([e], RANGE_START, RANGE_END);
        expect(cells.every((c) => c.entries.length === 0)).toBe(true);
    });
});
