import { describe, expect, it, vi } from "vitest";
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
} from "../../src/utils/zonedTime.js";

describe("zonedTime", () => {
    it("parses and formats a wall-clock string losslessly", () => {
        const w = parseWallTime("2024-03-10T02:30:00");
        expect(w).toEqual({ year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 });
        expect(formatWallTime(w!)).toBe("2024-03-10T02:30:00");
    });

    it("rejects a string carrying an offset or Z", () => {
        expect(parseWallTime("2024-03-10T02:30:00Z")).toBeUndefined();
        expect(parseWallTime("2024-03-10T02:30:00+01:00")).toBeUndefined();
    });

    it("converts a UTC instant to America/New_York's wall clock", () => {
        const utcMs = Date.UTC(2024, 2, 10, 6, 30, 0);
        expect(utcMsToWallTime(utcMs, "America/New_York")).toEqual({
            year: 2024,
            month: 3,
            day: 10,
            hour: 1,
            minute: 30,
            second: 0,
        });
    });

    it("round-trips a wall-clock time in a fixed-offset zone", () => {
        const w = { year: 2024, month: 6, day: 15, hour: 14, minute: 0, second: 0 };
        const utcMs = wallTimeToUtcMs(w, "UTC");
        expect(utcMsToWallTime(utcMs, "UTC")).toEqual(w);
    });

    it("resolves 09:00 America/New_York correctly on both sides of a DST boundary", () => {
        const est = { year: 2024, month: 3, day: 9, hour: 9, minute: 0, second: 0 };
        const edt = { year: 2024, month: 3, day: 11, hour: 9, minute: 0, second: 0 };

        expect(wallTimeToUtcMs(est, "America/New_York")).toBe(Date.UTC(2024, 2, 9, 14, 0, 0));
        expect(wallTimeToUtcMs(edt, "America/New_York")).toBe(Date.UTC(2024, 2, 11, 13, 0, 0));
    });

    it("detects a nonexistent local time inside the spring-forward gap", () => {
        const gap = { year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 };
        expect(wallTimeExists(gap, "America/New_York")).toBe(false);
    });

    it("resolves a floating date to that zone's midnight, and back", () => {
        const utcMs = floatingDateToUtcMs("2024-03-10", "America/New_York")!;
        expect(utcMs).toBe(Date.UTC(2024, 2, 10, 5, 0, 0));
        expect(utcMsToFloatingDate(utcMs, "America/New_York")).toBe("2024-03-10");
    });

    it("rejects anything that is not a bare YYYY-MM-DD", () => {
        expect(floatingDateToUtcMs("2024-03-10T00:00:00", "UTC")).toBeUndefined();
    });

    it("keeps the date across a DST transition, in both directions", () => {
        const day1 = { year: 2024, month: 11, day: 2, hour: 9, minute: 0, second: 0 };
        const day2 = { year: 2024, month: 11, day: 3, hour: 9, minute: 0, second: 0 };

        const ms1 = wallTimeToUtcMs(day1, "America/New_York");
        const ms2 = wallTimeToUtcMs(day2, "America/New_York");
        expect(ms2 - ms1).toBe(25 * 60 * 60 * 1000); // the 25-hour day
    });

    it("converts between a wall time and rrule's floating-Date shape", () => {
        const w = { year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 45 };
        const d = wallTimeToFloatingDate(w);
        expect(d.getUTCFullYear()).toBe(2024);
        expect(d.getUTCMonth()).toBe(2);
        expect(d.getUTCHours()).toBe(2);

        expect(floatingDateToWallTime(d)).toEqual(w);
    });

    it("parseWallTime returns undefined for invalid format", () => {
        expect(parseWallTime("invalid")).toBeUndefined();
    });

    it("floatingDateToUtcMs returns undefined for invalid format", () => {
        expect(floatingDateToUtcMs("invalid", "UTC")).toBeUndefined();
    });
});
