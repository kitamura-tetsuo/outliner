import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "$shared/types/yjs-types";
import { formatDragMoveLabel, formatDragResizeLabel, formatSubtreeShiftLabel } from "./calendarDragLabel";

describe("calendarDragLabel", () => {
    const timeZone = "America/New_York";
    const entry: CalendarEntry = {
        key: "1",
        title: "Test",
        startMs: 1690896000000, // Aug 1 2023 12:00 UTC
        endMs: 1690899600000, // Aug 1 2023 13:00 UTC
        allDay: false,
    };

    it("formats move for timed entry", () => {
        expect(formatDragMoveLabel(entry, 1690896000000, timeZone)).toBe("Tue, Aug 1 08:00 \u2013 09:00");
    });

    it("formats move for all-day entry", () => {
        const allDayEntry = { ...entry, allDay: true };
        expect(formatDragMoveLabel(allDayEntry, 1690848000000, timeZone)).toBe("Tue, Aug 1"); // Midnight UTC
    });

    it("formats resize for timed entry", () => {
        expect(formatDragResizeLabel(entry, 7200000, timeZone)).toBe("08:00 \u2013 10:00 (2h)");
    });

    it("formats subtree shift", () => {
        expect(formatSubtreeShiftLabel(86400000 * 3, 1690848000000, timeZone)).toBe("+3 days \u2192 Tue, Aug 1");
    });
});
