import { describe, expect, it } from "vitest";
import {
    computeViewRange,
    queryReferencesViewRange,
    shiftAnchor,
    VIEW_RANGE_END_SETTING,
    VIEW_RANGE_START_SETTING,
} from "./calendarViewRange";

describe("computeViewRange", () => {
    it("computes a single day for the day view", () => {
        const range = computeViewRange("day", new Date(2026, 7, 15, 14, 30));
        expect(range.start).toEqual(new Date(2026, 7, 15));
        expect(range.end).toEqual(new Date(2026, 7, 16));
    });

    it("computes a full calendar month for the month view", () => {
        const range = computeViewRange("month", new Date(2026, 7, 15));
        expect(range.start).toEqual(new Date(2026, 7, 1));
        expect(range.end).toEqual(new Date(2026, 8, 1));
    });

    it("computes a 7-day window starting on the configured week start for the week view", () => {
        // 2026-08-15 is a Saturday.
        const range = computeViewRange("week", new Date(2026, 7, 15), 0);
        expect(range.start).toEqual(new Date(2026, 7, 9)); // preceding Sunday
        expect(range.end).toEqual(new Date(2026, 7, 16));
    });

    it("falls back to the week window for an unrecognized view type", () => {
        const week = computeViewRange("week", new Date(2026, 7, 15), 0);
        const other = computeViewRange("gantt", new Date(2026, 7, 15), 0);
        expect(other).toEqual(week);
    });

    it("boundary: an instant exactly at the end of one window is the start of the next, never both", () => {
        const day = computeViewRange("day", new Date(2026, 7, 15));
        const nextDay = computeViewRange("day", new Date(2026, 7, 16));
        expect(day.end).toEqual(nextDay.start);
        // Half-open: `end` itself belongs to the next window, not this one.
        expect(day.end.getTime()).toBeGreaterThan(day.start.getTime());
    });
});

describe("shiftAnchor", () => {
    it("moves the day view by one day", () => {
        expect(shiftAnchor("day", new Date(2026, 7, 15), 1)).toEqual(new Date(2026, 7, 16));
        expect(shiftAnchor("day", new Date(2026, 7, 15), -1)).toEqual(new Date(2026, 7, 14));
    });

    it("moves the week view by seven days", () => {
        expect(shiftAnchor("week", new Date(2026, 7, 15), 1)).toEqual(new Date(2026, 7, 22));
    });

    it("moves the month view by one calendar month, preserving the day of month", () => {
        expect(shiftAnchor("month", new Date(2026, 7, 15), 1)).toEqual(new Date(2026, 8, 15));
        expect(shiftAnchor("month", new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 15));
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
