import { describe, expect, it } from "vitest";
import {
    floatingDateToUtcMs,
    floatingDateToWallTime,
    formatWallTime,
    parseWallTime,
    utcMsToFloatingDate,
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

    it("resolves a floating date to that zone's midnight, and back", () => {
        expect(floatingDateToUtcMs("2026-08-01", "UTC")).toBe(Date.parse("2026-08-01T00:00:00Z"));
        expect(floatingDateToUtcMs("2026-08-01", "Asia/Tokyo")).toBe(Date.parse("2026-07-31T15:00:00Z"));
        expect(floatingDateToUtcMs("2026-08-01", "America/New_York")).toBe(Date.parse("2026-08-01T04:00:00Z"));

        for (const zone of ["UTC", "Asia/Tokyo", "America/New_York", "Australia/Adelaide"]) {
            expect(utcMsToFloatingDate(floatingDateToUtcMs("2026-08-01", zone)!, zone)).toBe("2026-08-01");
        }
    });

    it("rejects anything that is not a bare YYYY-MM-DD", () => {
        expect(floatingDateToUtcMs("2026-08-01T00:00:00Z", "UTC")).toBeUndefined();
        expect(floatingDateToUtcMs("2026-8-1", "UTC")).toBeUndefined();
        expect(floatingDateToUtcMs("", "UTC")).toBeUndefined();
    });

    it("keeps the date across a DST transition, in both directions", () => {
        // US spring-forward 2026-03-08 and fall-back 2026-11-01 both start at
        // an hour other than midnight, so the day itself still has one.
        for (const date of ["2026-03-08", "2026-11-01"]) {
            const ms = floatingDateToUtcMs(date, "America/New_York")!;
            expect(utcMsToFloatingDate(ms, "America/New_York")).toBe(date);
        }
    });

    it("converts between a wall time and rrule's floating-Date shape", () => {
        const w = { year: 2026, month: 8, day: 3, hour: 9, minute: 0, second: 0 };
        const floating = wallTimeToFloatingDate(w);
        expect(floating.getUTCFullYear()).toBe(2026);
        expect(floating.getUTCHours()).toBe(9);
        expect(floatingDateToWallTime(floating)).toEqual(w);
    });
});
