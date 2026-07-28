import { describe, expect, it } from "vitest";
import { computeViewRange, resolveCalendarTimeZone, shiftAnchor } from "./calendarGridRange";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("resolveCalendarTimeZone", () => {
    it("returns the stored timezone when set", () => {
        expect(resolveCalendarTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
    });

    it("falls back to a resolvable zone when unset", () => {
        expect(resolveCalendarTimeZone(undefined)).toBeTruthy();
        expect(resolveCalendarTimeZone("")).toBeTruthy();
    });
});

describe("computeViewRange — pinned to UTC", () => {
    it("day view is exactly one 24h day starting at local midnight", () => {
        const anchor = Date.parse("2026-03-15T14:30:00Z");
        const range = computeViewRange(anchor, "day", 0, "UTC");
        expect(range.start).toBe(Date.parse("2026-03-15T00:00:00Z"));
        expect(range.end).toBe(Date.parse("2026-03-16T00:00:00Z"));
        expect(range.end - range.start).toBe(DAY);
    });

    it("days view spans the requested day count", () => {
        const anchor = Date.parse("2026-03-15T14:30:00Z");
        const range = computeViewRange(anchor, "days", 0, "UTC", 3);
        expect(range.start).toBe(Date.parse("2026-03-15T00:00:00Z"));
        expect(range.end).toBe(Date.parse("2026-03-18T00:00:00Z"));
    });

    it("week view is aligned to the configured week start (Monday=1)", () => {
        // 2026-03-15 is a Sunday.
        const anchor = Date.parse("2026-03-15T14:30:00Z");
        const range = computeViewRange(anchor, "week", 1, "UTC");
        expect(range.start).toBe(Date.parse("2026-03-09T00:00:00Z")); // preceding Monday
        expect(range.end).toBe(Date.parse("2026-03-16T00:00:00Z"));
    });

    it("week view aligned to Sunday start", () => {
        const anchor = Date.parse("2026-03-15T14:30:00Z"); // itself a Sunday
        const range = computeViewRange(anchor, "week", 0, "UTC");
        expect(range.start).toBe(Date.parse("2026-03-15T00:00:00Z"));
        expect(range.end).toBe(Date.parse("2026-03-22T00:00:00Z"));
    });

    it("month view pads to whole weeks (Monday start) around the calendar month", () => {
        // March 2026: March 1 is a Sunday, March 31 is a Tuesday.
        const anchor = Date.parse("2026-03-15T00:00:00Z");
        const range = computeViewRange(anchor, "month", 1, "UTC");
        // Grid must start on the Monday on/before March 1 -> Feb 23.
        expect(range.start).toBe(Date.parse("2026-02-23T00:00:00Z"));
        // Grid must end on the Monday after the week containing March 31 (a Tuesday) -> April 6.
        expect(range.end).toBe(Date.parse("2026-04-06T00:00:00Z"));
    });

    it("an entry exactly on a boundary belongs to exactly one window", () => {
        const day1 = computeViewRange(Date.parse("2026-03-15T00:00:00Z"), "day", 0, "UTC");
        const day2 = computeViewRange(Date.parse("2026-03-16T00:00:00Z"), "day", 0, "UTC");
        // The instant at the boundary is the exclusive end of day1 and the
        // inclusive start of day2 — never both, never neither.
        expect(day1.end).toBe(day2.start);
    });
});

describe("computeViewRange — timezone sensitivity", () => {
    it("the same instant produces different day windows in different zones", () => {
        // 2026-03-15T23:30 UTC is already 2026-03-16 in Tokyo (+09:00).
        const anchor = Date.parse("2026-03-15T23:30:00Z");
        const utc = computeViewRange(anchor, "day", 0, "UTC");
        const tokyo = computeViewRange(anchor, "day", 0, "Asia/Tokyo");
        expect(utc.start).toBe(Date.parse("2026-03-15T00:00:00Z"));
        expect(tokyo.start).toBe(Date.parse("2026-03-15T15:00:00Z")); // 2026-03-16T00:00 JST
    });
});

describe("computeViewRange — DST correctness (America/New_York)", () => {
    it("a day window spans 23h across the spring-forward transition", () => {
        // 2024-03-10 is the US spring-forward date.
        const anchor = Date.parse("2024-03-10T12:00:00-05:00");
        const range = computeViewRange(anchor, "day", 0, "America/New_York");
        expect(range.end - range.start).toBe(23 * HOUR);
    });

    it("a day window spans 25h across the fall-back transition", () => {
        // 2024-11-03 is the US fall-back date.
        const anchor = Date.parse("2024-11-03T12:00:00-04:00");
        const range = computeViewRange(anchor, "day", 0, "America/New_York");
        expect(range.end - range.start).toBe(25 * HOUR);
    });
});

describe("shiftAnchor", () => {
    it("steps a day view forward/backward by one day", () => {
        const anchor = Date.parse("2026-03-15T14:00:00Z");
        expect(shiftAnchor(anchor, "day", 0, "UTC", 1)).toBe(Date.parse("2026-03-16T00:00:00Z"));
        expect(shiftAnchor(anchor, "day", 0, "UTC", -1)).toBe(Date.parse("2026-03-14T00:00:00Z"));
    });

    it("steps a week view forward/backward by seven days", () => {
        const anchor = Date.parse("2026-03-15T14:00:00Z");
        expect(shiftAnchor(anchor, "week", 1, "UTC", 1)).toBe(Date.parse("2026-03-22T00:00:00Z"));
        expect(shiftAnchor(anchor, "week", 1, "UTC", -1)).toBe(Date.parse("2026-03-08T00:00:00Z"));
    });

    it("steps a month view forward/backward by a calendar month, not the padded grid span", () => {
        const anchor = Date.parse("2026-03-15T14:00:00Z");
        expect(shiftAnchor(anchor, "month", 1, "UTC", 1)).toBe(Date.parse("2026-04-01T00:00:00Z"));
        expect(shiftAnchor(anchor, "month", 1, "UTC", -1)).toBe(Date.parse("2026-02-01T00:00:00Z"));
    });

    it("wraps a month step across a year boundary", () => {
        const anchor = Date.parse("2026-12-15T14:00:00Z");
        expect(shiftAnchor(anchor, "month", 1, "UTC", 1)).toBe(Date.parse("2027-01-01T00:00:00Z"));
    });

    it("lands back on local midnight across a DST transition", () => {
        const anchor = Date.parse("2024-03-09T12:00:00-05:00");
        const next = shiftAnchor(anchor, "day", 0, "America/New_York", 1);
        // 2024-03-10T00:00 local time, which is -05:00 (still EST at midnight).
        expect(next).toBe(Date.parse("2024-03-10T00:00:00-05:00"));
    });
});
