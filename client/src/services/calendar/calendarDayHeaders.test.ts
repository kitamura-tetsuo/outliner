import { describe, expect, it } from "vitest";
import { computeDayHeaders } from "./calendarDayHeaders";
import { computeViewRange } from "./calendarGridRange";

describe("calendarDayHeaders", () => {
    it("computes exactly 7 headers for a week range", () => {
        // "2026-08-16T00:00:00" in Asia/Tokyo is UTC 2026-08-15T15:00:00Z
        const anchorUtcMs = Date.UTC(2026, 7, 15, 15, 0, 0);
        const range = computeViewRange(anchorUtcMs, "week", 0, "Asia/Tokyo");
        const dayCount = Math.round((range.end - range.start) / 86400000);

        const headers = computeDayHeaders(range.start, dayCount, "Asia/Tokyo");

        expect(headers).toHaveLength(7);
        expect(headers[0].dayIndex).toBe(0);
        expect(headers[0].isoDate).toBe("2026-08-16");
        expect(headers[0].weekday).toBe(0); // Sunday
        expect(headers[0].month).toBe(8);
        expect(headers[0].dayOfMonth).toBe(16);

        expect(headers[6].isoDate).toBe("2026-08-22");
        expect(headers[6].weekday).toBe(6); // Saturday
    });

    it("correct weekday/date across a DST transition", () => {
        // "2023-11-05" in America/Los_Angeles (DST ends, clocks go back 1 hour, Sunday)
        // 2023-11-05T00:00:00-07:00 is UTC 2023-11-05T07:00:00Z
        const anchorUtcMs = Date.UTC(2023, 10, 5, 7, 0, 0);
        const headers = computeDayHeaders(anchorUtcMs, 3, "America/Los_Angeles");

        expect(headers[0].isoDate).toBe("2023-11-05");
        expect(headers[0].weekday).toBe(0);

        expect(headers[1].isoDate).toBe("2023-11-06");
        expect(headers[1].weekday).toBe(1);

        expect(headers[2].isoDate).toBe("2023-11-07");
        expect(headers[2].weekday).toBe(2);
    });

    it("correct dates for a fixed non-local timezone", () => {
        // "2026-08-16T00:00:00" in Europe/London is UTC 2026-08-15T23:00:00Z
        const anchorUtcMs = Date.UTC(2026, 7, 15, 23, 0, 0);
        const headers = computeDayHeaders(anchorUtcMs, 1, "Europe/London");

        expect(headers[0].isoDate).toBe("2026-08-16");
        expect(headers[0].month).toBe(8);
        expect(headers[0].dayOfMonth).toBe(16);
        expect(headers[0].weekday).toBe(0); // Sunday
    });

    it("sets isMonthStart on a range spanning a month boundary", () => {
        // "2026-08-30" in Asia/Tokyo is UTC 2026-08-29T15:00:00Z
        const anchorUtcMs = Date.UTC(2026, 7, 29, 15, 0, 0);
        const headers = computeDayHeaders(anchorUtcMs, 3, "Asia/Tokyo");

        expect(headers[0].isoDate).toBe("2026-08-30");
        expect(headers[0].isMonthStart).toBe(true); // First item is always true per implementation logic "dayIndex === 0"

        expect(headers[1].isoDate).toBe("2026-08-31");
        expect(headers[1].isMonthStart).toBe(false);

        expect(headers[2].isoDate).toBe("2026-09-01");
        expect(headers[2].isMonthStart).toBe(true); // First of the month
        expect(headers[2].month).toBe(9);
        expect(headers[2].dayOfMonth).toBe(1);
    });
});
