import { describe, expect, it } from "vitest";
import { computeDayHeaders } from "./calendarDayHeaders";

const DAY_MS = 86_400_000;

describe("computeDayHeaders", () => {
    it("generates correct headers for a standard week", () => {
        // 2026-08-16 is a Sunday
        const startUtcMs = Date.UTC(2026, 7, 16);
        const headers = computeDayHeaders(startUtcMs, 7, "UTC");

        expect(headers).toHaveLength(7);
        expect(headers[0]).toEqual({
            dayIndex: 0,
            dateUtcMs: startUtcMs,
            weekday: 0,
            isoDate: "2026-08-16",
            dayOfMonth: 16,
            isMonthStart: false,
        });
        expect(headers[1].weekday).toBe(1);
        expect(headers[6].isoDate).toBe("2026-08-22");
    });

    it("correctly identifies month boundaries", () => {
        // 2026-08-30 (Sunday) to 2026-09-05 (Saturday)
        const startUtcMs = Date.UTC(2026, 7, 30);
        const headers = computeDayHeaders(startUtcMs, 7, "UTC");

        expect(headers[0].isMonthStart).toBe(false); // Aug 30
        expect(headers[1].isMonthStart).toBe(false); // Aug 31
        expect(headers[2].isMonthStart).toBe(true);  // Sep 1
        expect(headers[2].isoDate).toBe("2026-09-01");
        expect(headers[3].isMonthStart).toBe(false); // Sep 2
    });

    it("computes dates in the given time zone", () => {
        // 2026-08-16T15:00:00Z -> 2026-08-17T00:00:00+09:00 (Asia/Tokyo midnight)
        const tokyoMidnightUtcMs = Date.UTC(2026, 7, 16, 15, 0, 0);

        const tokyoHeaders = computeDayHeaders(tokyoMidnightUtcMs, 1, "Asia/Tokyo");
        expect(tokyoHeaders[0]).toEqual({
            dayIndex: 0,
            dateUtcMs: tokyoMidnightUtcMs,
            weekday: 1, // Monday in Tokyo
            isoDate: "2026-08-17",
            dayOfMonth: 17,
            isMonthStart: false,
        });
    });

    it("handles daylight saving time transitions", () => {
        // America/Los_Angeles spring forward: 2026-03-08
        // UTC: 2026-03-08T08:00:00Z
        const springForwardMidnightUtcMs = Date.UTC(2026, 2, 8, 8, 0, 0);

        const headers = computeDayHeaders(springForwardMidnightUtcMs, 2, "America/Los_Angeles");
        expect(headers[0].isoDate).toBe("2026-03-08");
        expect(headers[0].weekday).toBe(0); // Sunday

        // Next day is 23 hours later in local time, but we just want to ensure it computes right
        expect(headers[1].isoDate).toBe("2026-03-09");
        expect(headers[1].weekday).toBe(1); // Monday
    });
});
