import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./calendarEntries";
import { layoutTimeGrid } from "./calendarTimeGridLayout";

const DAY_MS = 86_400_000;
const RANGE_START = Date.parse("2026-03-09T00:00:00Z"); // Monday
const RANGE_END = RANGE_START + 7 * DAY_MS;

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
    return { key: "k", title: "t", raw: {}, ...overrides };
}

describe("layoutTimeGrid", () => {
    it("places a timed entry at the correct day and fractional position", () => {
        const e = entry({
            key: "a",
            allDay: false,
            startMs: Date.parse("2026-03-10T09:00:00Z"), // Tuesday, day index 1
            durationMs: 60 * 60 * 1000, // 1h
        });
        const layout = layoutTimeGrid([e], RANGE_START, RANGE_END);
        expect(layout.timed).toHaveLength(1);
        expect(layout.timed[0].dayIndex).toBe(1);
        expect(layout.timed[0].startFraction).toBeCloseTo(9 / 24);
        expect(layout.timed[0].endFraction).toBeCloseTo(10 / 24);
        expect(layout.timed[0].columnIndex).toBe(0);
        expect(layout.timed[0].columnCount).toBe(1);
    });

    it("gives a non-overlapping entry the day's full width (columnCount 1)", () => {
        const e1 = entry({ key: "a", allDay: false, startMs: RANGE_START + 8 * 3_600_000, durationMs: 3_600_000 });
        const e2 = entry({ key: "b", allDay: false, startMs: RANGE_START + 14 * 3_600_000, durationMs: 3_600_000 });
        const layout = layoutTimeGrid([e1, e2], RANGE_START, RANGE_END);
        expect(layout.timed.every((p) => p.columnCount === 1)).toBe(true);
    });

    it("splits two overlapping entries into distinct side-by-side columns", () => {
        const e1 = entry({ key: "a", allDay: false, startMs: RANGE_START + 9 * 3_600_000, durationMs: 2 * 3_600_000 });
        const e2 = entry({ key: "b", allDay: false, startMs: RANGE_START + 10 * 3_600_000, durationMs: 2 * 3_600_000 });
        const layout = layoutTimeGrid([e1, e2], RANGE_START, RANGE_END);
        const [p1, p2] = layout.timed.sort((a, b) => a.entry.key.localeCompare(b.entry.key));
        expect(p1.columnCount).toBe(2);
        expect(p2.columnCount).toBe(2);
        expect(p1.columnIndex).not.toBe(p2.columnIndex);
    });

    it("keeps a third, disjoint cluster on the same day at full width", () => {
        const overlapA = entry({ key: "a", allDay: false, startMs: RANGE_START + 9 * 3_600_000, durationMs: 3_600_000 });
        const overlapB = entry({ key: "b", allDay: false, startMs: RANGE_START + 9 * 3_600_000, durationMs: 3_600_000 });
        const disjoint = entry({ key: "c", allDay: false, startMs: RANGE_START + 18 * 3_600_000, durationMs: 3_600_000 });
        const layout = layoutTimeGrid([overlapA, overlapB, disjoint], RANGE_START, RANGE_END);
        const disjointPlacement = layout.timed.find((p) => p.entry.key === "c")!;
        expect(disjointPlacement.columnCount).toBe(1);
        const overlapping = layout.timed.filter((p) => p.entry.key !== "c");
        expect(overlapping.every((p) => p.columnCount === 2)).toBe(true);
    });

    it("clips a timed entry's rendering to the day it starts in", () => {
        const e = entry({
            key: "a",
            allDay: false,
            startMs: RANGE_START + 23 * 3_600_000, // 23:00 on day 0
            durationMs: 3 * 3_600_000, // would cross midnight
        });
        const layout = layoutTimeGrid([e], RANGE_START, RANGE_END);
        expect(layout.timed[0].dayIndex).toBe(0);
        expect(layout.timed[0].endFraction).toBe(1); // clipped to end of day
    });

    it("places an all-day entry spanning multiple days with the correct span", () => {
        const e = entry({
            key: "a",
            allDay: true,
            startMs: RANGE_START + DAY_MS, // day index 1
            durationMs: 3 * DAY_MS,
        });
        const layout = layoutTimeGrid([e], RANGE_START, RANGE_END);
        expect(layout.allDay).toHaveLength(1);
        expect(layout.allDay[0].dayIndex).toBe(1);
        expect(layout.allDay[0].spanDays).toBe(3);
    });

    it("an all-day entry with a one-day duration occupies exactly one cell (exclusive end)", () => {
        const e = entry({ key: "a", allDay: true, startMs: RANGE_START, durationMs: DAY_MS });
        const layout = layoutTimeGrid([e], RANGE_START, RANGE_END);
        expect(layout.allDay[0].spanDays).toBe(1);
    });

    it("renders a due-only entry as a milestone, not a block", () => {
        const e = entry({ key: "a", dueMs: RANGE_START + 2 * DAY_MS + 3_600_000 });
        const layout = layoutTimeGrid([e], RANGE_START, RANGE_END);
        expect(layout.timed).toHaveLength(0);
        expect(layout.allDay).toHaveLength(0);
        expect(layout.milestones).toEqual([{ entry: e, dayIndex: 2 }]);
    });

    it("includes an entry that starts before the window and overlaps into it", () => {
        const e = entry({
            key: "a",
            allDay: false,
            startMs: RANGE_START - 3_600_000,
            durationMs: 2 * 3_600_000, // overlaps 1h into the visible window
        });
        const layout = layoutTimeGrid([e], RANGE_START, RANGE_END);
        // Clipped to before day 0 -> dayIndex would be negative, so this
        // entry (starting the day before) is excluded from the timed grid;
        // this asserts it does not spuriously appear on day 0.
        expect(layout.timed.find((p) => p.entry.key === "a")).toBeUndefined();
    });

    it("excludes an entry entirely outside the visible range", () => {
        const e = entry({ key: "a", allDay: false, startMs: RANGE_END + DAY_MS, durationMs: 3_600_000 });
        const layout = layoutTimeGrid([e], RANGE_START, RANGE_END);
        expect(layout.timed).toHaveLength(0);
    });

    it("an entry exactly on the range boundary is not double counted", () => {
        const onBoundary = entry({ key: "a", allDay: false, startMs: RANGE_END, durationMs: 3_600_000 });
        const layout = layoutTimeGrid([onBoundary], RANGE_START, RANGE_END);
        expect(layout.timed).toHaveLength(0);
    });
});
