import { describe, expect, it } from "vitest";
import { formatDragMoveLabel, formatDragResizeLabel, formatSubtreeShiftLabel } from "./calendarDragLabel";
import type { CalendarEntry } from "./calendarEntries";

const NY = "America/New_York";
const TOKYO = "Asia/Tokyo";

function entry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
    return {
        key: "items:1",
        title: "Standup",
        allDay: false,
        // 2023-08-01T12:00:00Z = 08:00 in New York, 21:00 in Tokyo.
        startMs: Date.UTC(2023, 7, 1, 12, 0, 0),
        durationMs: 30 * 60_000,
        raw: {},
        ...overrides,
    };
}

describe("formatDragMoveLabel", () => {
    it("shows the destination date and the start/end times of a timed entry", () => {
        expect(formatDragMoveLabel(entry(), Date.UTC(2023, 7, 3, 13, 15, 0), NY)).toBe("Thu, Aug 3 09:15 – 09:45");
    });

    it("formats in the calendar's timezone, not the viewer's", () => {
        expect(formatDragMoveLabel(entry(), Date.UTC(2023, 7, 1, 12, 0, 0), TOKYO)).toBe("Tue, Aug 1 21:00 – 21:30");
    });

    it("shows a date alone for an all-day entry", () => {
        const allDay = entry({ allDay: true, startMs: Date.UTC(2023, 7, 1, 4, 0, 0), durationMs: undefined });
        expect(formatDragMoveLabel(allDay, Date.UTC(2023, 7, 4, 4, 0, 0), NY)).toBe("Fri, Aug 4");
    });

    it("falls back to a 30 minute span when the entry has no duration", () => {
        const noDuration = entry({ durationMs: undefined });
        expect(formatDragMoveLabel(noDuration, Date.UTC(2023, 7, 1, 12, 0, 0), NY)).toBe("Tue, Aug 1 08:00 – 08:30");
    });

    it("crosses a DST boundary in the calendar's own zone", () => {
        // 2023-11-05 01:30 EDT (UTC-4) + 1h lands on 01:30 EST (UTC-5) —
        // the same wall-clock hour repeated, which is exactly what the
        // dropped entry will read afterwards.
        const dst = entry({ startMs: Date.UTC(2023, 10, 5, 5, 30, 0), durationMs: 60 * 60_000 });
        expect(formatDragMoveLabel(dst, Date.UTC(2023, 10, 5, 5, 30, 0), NY)).toBe("Sun, Nov 5 01:30 – 01:30");
    });

    it("shows the date alone at day granularity (Gantt)", () => {
        expect(formatDragMoveLabel(entry(), Date.UTC(2023, 7, 3, 13, 15, 0), NY, { granularity: "day" })).toBe(
            "Thu, Aug 3",
        );
    });
});

describe("formatDragResizeLabel", () => {
    it("shows the new span and its duration", () => {
        expect(formatDragResizeLabel(entry(), 90 * 60_000, NY)).toBe("08:00 – 09:30 (1h30m)");
    });

    it("drops the minute part for a whole-hour duration", () => {
        expect(formatDragResizeLabel(entry(), 2 * 60 * 60_000, NY)).toBe("08:00 – 10:00 (2h)");
    });

    it("shows minutes alone for a sub-hour duration", () => {
        expect(formatDragResizeLabel(entry(), 45 * 60_000, NY)).toBe("08:00 – 08:45 (45m)");
    });

    it("shows dates and whole days at day granularity (Gantt)", () => {
        expect(formatDragResizeLabel(entry(), 3 * 86_400_000, NY, { granularity: "day" })).toBe(
            "Tue, Aug 1 – Fri, Aug 4 (3 days)",
        );
    });

    it("resizes from an explicit start when the bar is not the entry's own start", () => {
        expect(formatDragResizeLabel(entry(), 60 * 60_000, NY, { startMs: Date.UTC(2023, 7, 2, 18, 0, 0) })).toBe(
            "14:00 – 15:00 (1h)",
        );
    });

    it("is empty when there is no start to resize from", () => {
        expect(formatDragResizeLabel(entry({ startMs: undefined }), 60 * 60_000, NY)).toBe("");
    });
});

describe("formatSubtreeShiftLabel", () => {
    it("shows a forward shift and the resulting subtree start", () => {
        expect(formatSubtreeShiftLabel(3 * 86_400_000, Date.UTC(2023, 7, 4, 12, 0, 0), NY)).toBe(
            "+3 days → Fri, Aug 4",
        );
    });

    it("shows a backward shift", () => {
        expect(formatSubtreeShiftLabel(-86_400_000, Date.UTC(2023, 6, 31, 12, 0, 0), NY)).toBe(
            "-1 day → Mon, Jul 31",
        );
    });

    it("shows a zero shift while the pointer is still inside the first day", () => {
        expect(formatSubtreeShiftLabel(0, Date.UTC(2023, 7, 1, 12, 0, 0), NY)).toBe("0 days → Tue, Aug 1");
    });
});
