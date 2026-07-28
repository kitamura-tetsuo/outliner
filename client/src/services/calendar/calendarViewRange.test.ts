import { describe, expect, it } from "vitest";
import {
    computeViewRange,
    queryReferencesViewRange,
    shiftAnchor,
    VIEW_RANGE_END_SETTING,
    VIEW_RANGE_START_SETTING,
} from "./calendarViewRange";

// Every case below pins an explicit IANA zone rather than depending on the
// test runner's ambient zone (AGENTS.md §2 / docs/crdt-sql-architecture.md
// §6.5's own acceptance criterion). Anchors are constructed from explicit
// UTC instants (`Date.UTC` / a `Z`-suffixed ISO string) for the same reason.

describe("computeViewRange", () => {
    it("computes a single day for the day view, in UTC", () => {
        const range = computeViewRange("day", new Date(Date.UTC(2026, 7, 15, 14, 30)), "UTC");
        expect(range.start).toEqual(new Date(Date.UTC(2026, 7, 15)));
        expect(range.end).toEqual(new Date(Date.UTC(2026, 7, 16)));
    });

    it("computes a full calendar month for the month view, in UTC", () => {
        const range = computeViewRange("month", new Date(Date.UTC(2026, 7, 15)), "UTC");
        expect(range.start).toEqual(new Date(Date.UTC(2026, 7, 1)));
        expect(range.end).toEqual(new Date(Date.UTC(2026, 8, 1)));
    });

    it("computes a 7-day window starting on the configured week start for the week view, in UTC", () => {
        // 2026-08-15 is a Saturday.
        const range = computeViewRange("week", new Date(Date.UTC(2026, 7, 15)), "UTC", 0);
        expect(range.start).toEqual(new Date(Date.UTC(2026, 7, 9))); // preceding Sunday
        expect(range.end).toEqual(new Date(Date.UTC(2026, 7, 16)));
    });

    it("falls back to the week window for an unrecognized view type", () => {
        const week = computeViewRange("week", new Date(Date.UTC(2026, 7, 15)), "UTC", 0);
        const other = computeViewRange("gantt", new Date(Date.UTC(2026, 7, 15)), "UTC", 0);
        expect(other).toEqual(week);
    });

    it("boundary: an instant exactly at the end of one window is the start of the next, never both", () => {
        const day = computeViewRange("day", new Date(Date.UTC(2026, 7, 15)), "UTC");
        const nextDay = computeViewRange("day", new Date(Date.UTC(2026, 7, 16)), "UTC");
        expect(day.end).toEqual(nextDay.start);
        // Half-open: `end` itself belongs to the next window, not this one.
        expect(day.end.getTime()).toBeGreaterThan(day.start.getTime());
    });

    it("computes the window in the given zone, not the runner's ambient zone", () => {
        // 2026-08-15T14:30:00Z is 2026-08-15 in UTC, but already 2026-08-15
        // 23:30 in Tokyo (UTC+9) and still 2026-08-15 10:30 in New York
        // (UTC-4, EDT) — same instant, different local calendar day only for
        // the day view's *boundaries*, not its date-of-day here since both
        // zones happen to read the 15th; a zone that reads a different date
        // is exercised separately below.
        const anchor = new Date("2026-08-15T14:30:00Z");
        const tokyo = computeViewRange("day", anchor, "Asia/Tokyo");
        const utc = computeViewRange("day", anchor, "UTC");
        expect(tokyo).not.toEqual(utc);
        // Tokyo's midnight-to-midnight window is 9 hours behind UTC's.
        expect(tokyo.start.getTime()).toBe(utc.start.getTime() - 9 * 60 * 60 * 1000);
    });

    it("the same instant can fall on different local dates in different zones", () => {
        // 2026-08-15T23:30:00Z is already 2026-08-16 08:30 in Tokyo.
        const anchor = new Date("2026-08-15T23:30:00Z");
        const tokyoDay = computeViewRange("day", anchor, "Asia/Tokyo");
        const utcDay = computeViewRange("day", anchor, "UTC");
        expect(tokyoDay.start.getTime()).not.toBe(utcDay.start.getTime());
        // Tokyo's window covers 2026-08-16 local, one day ahead of UTC's.
        expect(tokyoDay.start.getTime()).toBe(utcDay.start.getTime() + 15 * 60 * 60 * 1000);
    });

    it("a day window is shorter than 24h across a spring-forward DST transition", () => {
        // America/New_York springs forward on 2026-03-08 (2:00 -> 3:00).
        const range = computeViewRange("day", new Date("2026-03-08T12:00:00Z"), "America/New_York");
        expect(range.end.getTime() - range.start.getTime()).toBe(23 * 60 * 60 * 1000);
    });

    it("a day window is longer than 24h across a fall-back DST transition", () => {
        // America/New_York falls back on 2026-11-01 (2:00 -> 1:00).
        const range = computeViewRange("day", new Date("2026-11-01T12:00:00Z"), "America/New_York");
        expect(range.end.getTime() - range.start.getTime()).toBe(25 * 60 * 60 * 1000);
    });
});

describe("shiftAnchor", () => {
    it("moves the day view by one day, in UTC", () => {
        expect(shiftAnchor("day", new Date(Date.UTC(2026, 7, 15)), 1, "UTC")).toEqual(new Date(Date.UTC(2026, 7, 16)));
        expect(shiftAnchor("day", new Date(Date.UTC(2026, 7, 15)), -1, "UTC")).toEqual(
            new Date(Date.UTC(2026, 7, 14)),
        );
    });

    it("moves the week view by seven days, in UTC", () => {
        expect(shiftAnchor("week", new Date(Date.UTC(2026, 7, 15)), 1, "UTC")).toEqual(
            new Date(Date.UTC(2026, 7, 22)),
        );
    });

    it("moves the month view by one calendar month, preserving the day of month, in UTC", () => {
        expect(shiftAnchor("month", new Date(Date.UTC(2026, 7, 15)), 1, "UTC")).toEqual(
            new Date(Date.UTC(2026, 8, 15)),
        );
        expect(shiftAnchor("month", new Date(Date.UTC(2026, 0, 15)), -1, "UTC")).toEqual(
            new Date(Date.UTC(2025, 11, 15)),
        );
    });

    it("keeps landing on local midnight across a DST transition", () => {
        const before = shiftAnchor("day", new Date("2026-03-07T12:00:00Z"), 1, "America/New_York");
        // The result is still midnight local, i.e. re-running computeViewRange
        // from it reproduces the same start as computing straight from the
        // post-transition date.
        const rangeFromShift = computeViewRange("day", before, "America/New_York");
        const rangeDirect = computeViewRange("day", new Date("2026-03-08T12:00:00Z"), "America/New_York");
        expect(rangeFromShift).toEqual(rangeDirect);
    });
});

describe("queryReferencesViewRange", () => {
    it("is false for a query referencing neither setting", () => {
        expect(queryReferencesViewRange("SELECT id, due FROM outline_items")).toBe(false);
    });

    it(`is true for a query referencing only ${VIEW_RANGE_START_SETTING}`, () => {
        const sql =
            `SELECT id FROM outline_items WHERE start_at >= current_setting('${VIEW_RANGE_START_SETTING}')::timestamptz`;
        expect(queryReferencesViewRange(sql)).toBe(true);
    });

    it(`is true for a query referencing only ${VIEW_RANGE_END_SETTING}`, () => {
        const sql =
            `SELECT id FROM outline_items WHERE start_at < current_setting('${VIEW_RANGE_END_SETTING}')::timestamptz`;
        expect(queryReferencesViewRange(sql)).toBe(true);
    });

    it("is true for a query using the full overlap idiom", () => {
        const sql = `SELECT id FROM outline_items
            WHERE start_at < current_setting('${VIEW_RANGE_END_SETTING}')::timestamptz
              AND start_at + duration > current_setting('${VIEW_RANGE_START_SETTING}')::timestamptz`;
        expect(queryReferencesViewRange(sql)).toBe(true);
    });
});
