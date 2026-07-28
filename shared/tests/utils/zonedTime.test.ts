import { describe, expect, it } from "vitest";
import {
    floatingDateToWallTime,
    formatWallTime,
    parseWallTime,
    utcMsToWallTime,
    wallTimeExists,
    wallTimeToFloatingDate,
    wallTimeToUtcMs,
} from "../../src/utils/zonedTime";

describe("zonedTime", () => {
    it("parses and formats a wall-clock string losslessly", () => {
        const w = parseWallTime("2026-08-03T09:05:07");
        expect(w).toEqual({ year: 2026, month: 8, day: 3, hour: 9, minute: 5, second: 7 });
        expect(formatWallTime(w!)).toBe("2026-08-03T09:05:07");
    });

    it("rejects a string carrying an offset or Z", () => {
        expect(parseWallTime("2026-08-03T09:05:07Z")).toBeUndefined();
        expect(parseWallTime("2026-08-03T09:05:07+09:00")).toBeUndefined();
        expect(parseWallTime("not a date")).toBeUndefined();
    });

    it("converts a UTC instant to America/New_York's wall clock", () => {
        // 2026-01-15T12:00:00Z is 07:00 EST (UTC-5, standard time).
        const wall = utcMsToWallTime(Date.parse("2026-01-15T12:00:00Z"), "America/New_York");
        expect(wall).toEqual({ year: 2026, month: 1, day: 15, hour: 7, minute: 0, second: 0 });
    });

    it("round-trips a wall-clock time in a fixed-offset zone", () => {
        const w = { year: 2026, month: 8, day: 3, hour: 9, minute: 0, second: 0 };
        const utcMs = wallTimeToUtcMs(w, "UTC");
        expect(utcMs).toBe(Date.parse("2026-08-03T09:00:00Z"));
        expect(utcMsToWallTime(utcMs, "UTC")).toEqual(w);
    });

    it("resolves 09:00 America/New_York correctly on both sides of a DST boundary", () => {
        // US DST spring-forward: 2026-03-08. Before: EST (UTC-5). After: EDT (UTC-4).
        const before = wallTimeToUtcMs(
            { year: 2026, month: 3, day: 1, hour: 9, minute: 0, second: 0 },
            "America/New_York",
        );
        const after = wallTimeToUtcMs(
            { year: 2026, month: 3, day: 15, hour: 9, minute: 0, second: 0 },
            "America/New_York",
        );
        expect(before).toBe(Date.parse("2026-03-01T14:00:00Z"));
        expect(after).toBe(Date.parse("2026-03-15T13:00:00Z"));
    });

    it("detects a nonexistent local time inside the spring-forward gap", () => {
        // US spring-forward 2026-03-08: 02:00-03:00 local does not exist.
        const gap = { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 };
        expect(wallTimeExists(gap, "America/New_York")).toBe(false);

        const ordinary = { year: 2026, month: 3, day: 8, hour: 9, minute: 0, second: 0 };
        expect(wallTimeExists(ordinary, "America/New_York")).toBe(true);
    });

    it("converts between a wall time and rrule's floating-Date shape", () => {
        const w = { year: 2026, month: 8, day: 3, hour: 9, minute: 0, second: 0 };
        const floating = wallTimeToFloatingDate(w);
        expect(floating.getUTCFullYear()).toBe(2026);
        expect(floating.getUTCHours()).toBe(9);
        expect(floatingDateToWallTime(floating)).toEqual(w);
    });
});
