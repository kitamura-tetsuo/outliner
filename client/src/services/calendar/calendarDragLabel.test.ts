import { describe, expect, it } from "vitest";
import { formatDragMoveLabel, formatDragResizeLabel, formatSubtreeShiftLabel } from "./calendarDragLabel";
import type { CalendarEntry } from "./calendarEntries";

describe("calendarDragLabel", () => {
    const timeZone = "America/New_York"; // UTC-4 in summer, UTC-5 in winter

    describe("formatDragMoveLabel", () => {
        it("formats all-day entries with date only", () => {
            const entry: CalendarEntry = { key: "1", title: "Test", allDay: true, raw: {} as any };
            // Aug 3, 2023, midnight in NY is Aug 3 04:00:00 UTC
            const newStartMs = Date.UTC(2023, 7, 3, 4, 0, 0);
            expect(formatDragMoveLabel(entry, newStartMs, timeZone)).toBe("Thu, Aug 3");
        });

        it("formats timed entries on the same day", () => {
            const entry: CalendarEntry = { key: "1", title: "Test", durationMs: 1800000, raw: {} as any }; // 30 mins
            // Aug 3, 2023, 09:15 in NY is Aug 3 13:15:00 UTC
            const newStartMs = Date.UTC(2023, 7, 3, 13, 15, 0);
            expect(formatDragMoveLabel(entry, newStartMs, timeZone)).toBe("Thu 8/3 09:15 – 09:45");
        });

        it("formats timed entries crossing midnight", () => {
            const entry: CalendarEntry = { key: "1", title: "Test", durationMs: 3600000 * 2, raw: {} as any }; // 2 hours
            // Aug 3, 2023, 23:00 in NY is Aug 4 03:00:00 UTC
            const newStartMs = Date.UTC(2023, 7, 4, 3, 0, 0);
            expect(formatDragMoveLabel(entry, newStartMs, timeZone)).toBe("Thu 8/3 23:00 – Fri 8/4 01:00");
        });
    });

    describe("formatDragResizeLabel", () => {
        it("formats all-day resize", () => {
            const entry: CalendarEntry = { key: "1", title: "Test", allDay: true, startMs: Date.UTC(2023, 7, 3, 4, 0, 0), raw: {} as any };
            const newDurationMs = 86400000 * 3; // 3 days
            expect(formatDragResizeLabel(entry, newDurationMs, timeZone)).toBe("Thu, Aug 3 – Sun, Aug 6 (3d)");
        });

        it("formats timed resize on same day", () => {
            // Aug 3, 2023, 09:00 in NY is Aug 3 13:00:00 UTC
            const entry: CalendarEntry = { key: "1", title: "Test", startMs: Date.UTC(2023, 7, 3, 13, 0, 0), raw: {} as any };
            const newDurationMs = 3600000 * 1.5; // 1h30m
            expect(formatDragResizeLabel(entry, newDurationMs, timeZone)).toBe("09:00 – 10:30 (1h30m)");
        });

        it("formats timed resize crossing day", () => {
            // Aug 3, 2023, 23:00 in NY is Aug 4 03:00:00 UTC
            const entry: CalendarEntry = { key: "1", title: "Test", startMs: Date.UTC(2023, 7, 4, 3, 0, 0), raw: {} as any };
            const newDurationMs = 3600000 * 2.5; // 2h30m
            expect(formatDragResizeLabel(entry, newDurationMs, timeZone)).toBe("23:00 – Fri 8/4 01:30 (2h30m)");
        });
    });

    describe("formatSubtreeShiftLabel", () => {
        it("formats positive subtree shift", () => {
            // Aug 3, 2023, midnight in NY
            const newStartMs = Date.UTC(2023, 7, 3, 4, 0, 0);
            const deltaMs = 86400000 * 3;
            expect(formatSubtreeShiftLabel(deltaMs, newStartMs, timeZone)).toBe("+3 days (Thu, Aug 3)");
        });

        it("formats negative subtree shift", () => {
            // Aug 3, 2023, midnight in NY
            const newStartMs = Date.UTC(2023, 7, 3, 4, 0, 0);
            const deltaMs = -86400000 * 1;
            expect(formatSubtreeShiftLabel(deltaMs, newStartMs, timeZone)).toBe("-1 day (Thu, Aug 3)");
        });
    });
});
