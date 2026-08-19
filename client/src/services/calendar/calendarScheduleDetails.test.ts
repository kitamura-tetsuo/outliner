import { describe, expect, it } from "vitest";
import {
    formatMembershipLines,
    formatOccurrenceTiming,
    formatScheduleDetailLines,
    formatScheduleSummary,
} from "./calendarScheduleDetails";
import type { CalendarMembership } from "./calendarScheduleIndex.svelte";

const MARCH_16_0900_UTC = Date.parse("2026-03-16T09:00:00.000Z");

describe("formatOccurrenceTiming", () => {
    it("renders a timed occurrence with its end time and duration", () => {
        expect(
            formatOccurrenceTiming(
                { entryKey: "e", title: "Standup", allDay: false, startMs: MARCH_16_0900_UTC, durationMs: 1_800_000 },
                "UTC",
            ),
        ).toBe("Mon, Mar 16 09:00 – 09:30 (30m)");
    });

    it("renders the same instant in the calendar's zone, not the viewer's", () => {
        expect(
            formatOccurrenceTiming(
                { entryKey: "e", title: "Standup", allDay: false, startMs: MARCH_16_0900_UTC },
                "Asia/Tokyo",
            ),
        ).toBe("Mon, Mar 16 18:00");
        expect(
            formatOccurrenceTiming(
                { entryKey: "e", title: "Standup", allDay: false, startMs: MARCH_16_0900_UTC },
                "America/Los_Angeles",
            ),
        ).toBe("Mon, Mar 16 02:00");
    });

    it("renders an all-day occurrence as a date, never as midnight", () => {
        const midnightTokyo = Date.parse("2026-03-15T15:00:00.000Z");
        expect(
            formatOccurrenceTiming(
                { entryKey: "e", title: "Launch", allDay: true, startMs: midnightTokyo },
                "Asia/Tokyo",
            ),
        ).toBe("Mon, Mar 16 (all day)");
    });

    it("renders a multi-day all-day occurrence as a date span", () => {
        const midnightUtc = Date.parse("2026-03-16T00:00:00.000Z");
        expect(
            formatOccurrenceTiming(
                { entryKey: "e", title: "Sprint", allDay: true, startMs: midnightUtc, durationMs: 3 * 86_400_000 },
                "UTC",
            ),
        ).toBe("Mon, Mar 16 – Wed, Mar 18 (all day)");
    });

    it("advances an all-day span in calendar days, not elapsed milliseconds, across a DST change", () => {
        // 2026-03-07 00:00 in New York, two all-day days: Mar 7 and Mar 8.
        // The clocks go forward on Mar 8, so the span is 47 elapsed hours —
        // adding two fixed days would name Mar 9.
        const midnightNewYork = Date.parse("2026-03-07T05:00:00.000Z");
        expect(
            formatOccurrenceTiming(
                { entryKey: "e", title: "Retreat", allDay: true, startMs: midnightNewYork, durationMs: 2 * 86_400_000 },
                "America/New_York",
            ),
        ).toBe("Sat, Mar 7 – Sun, Mar 8 (all day)");
    });

    it("renders a due-only occurrence as a deadline", () => {
        expect(
            formatOccurrenceTiming({ entryKey: "e", title: "Report", dueMs: MARCH_16_0900_UTC }, "UTC"),
        ).toBe("due Mon, Mar 16 09:00");
    });

    it("renders a start and a due together", () => {
        expect(
            formatOccurrenceTiming(
                {
                    entryKey: "e",
                    title: "Report",
                    allDay: false,
                    startMs: MARCH_16_0900_UTC,
                    dueMs: MARCH_16_0900_UTC + 8 * 3_600_000,
                },
                "UTC",
            ),
        ).toBe("Mon, Mar 16 09:00, due Mon, Mar 16 17:00");
    });

    it("says so plainly when a row has no scheduling value at all", () => {
        expect(formatOccurrenceTiming({ entryKey: "e", title: "Someday" }, "UTC")).toBe("no date");
    });
});

describe("formatMembershipLines", () => {
    const membership: CalendarMembership = {
        calendarId: "cal-1",
        calendarName: "Team",
        timeZone: "Asia/Tokyo",
        occurrences: [
            { entryKey: "e1", title: "Standup", allDay: false, startMs: MARCH_16_0900_UTC, durationMs: 1_800_000 },
            {
                entryKey: "e2",
                title: "Standup",
                allDay: false,
                startMs: MARCH_16_0900_UTC + 86_400_000,
                durationMs: 1_800_000,
            },
        ],
        hiddenOccurrenceCount: 4,
    };

    it("names the calendar and its timezone on every occurrence line", () => {
        expect(formatMembershipLines(membership)).toEqual([
            "Team: Mon, Mar 16 18:00 – 18:30 (30m) (Asia/Tokyo)",
            "Team: Tue, Mar 17 18:00 – 18:30 (30m) (Asia/Tokyo)",
            "Team: +4 more occurrences",
        ]);
    });

    it("falls back to a readable name for an unnamed calendar", () => {
        expect(
            formatMembershipLines({ ...membership, calendarName: "", occurrences: [], hiddenOccurrenceCount: 0 }),
        ).toEqual(["Untitled calendar: no date (Asia/Tokyo)"]);
    });
});

describe("formatScheduleDetailLines / formatScheduleSummary", () => {
    const work: CalendarMembership = {
        calendarId: "cal-work",
        calendarName: "Work",
        timeZone: "UTC",
        occurrences: [{ entryKey: "e1", title: "Standup", allDay: false, startMs: MARCH_16_0900_UTC }],
        hiddenOccurrenceCount: 0,
    };
    const home: CalendarMembership = {
        calendarId: "cal-home",
        calendarName: "Home",
        timeZone: "UTC",
        occurrences: [{ entryKey: "e2", title: "Standup", allDay: true, startMs: Date.parse("2026-03-16T00:00:00Z") }],
        hiddenOccurrenceCount: 0,
    };

    it("keeps every calendar's line — a second membership is never collapsed away", () => {
        expect(formatScheduleDetailLines([work, home])).toEqual([
            "Work: Mon, Mar 16 09:00 (UTC)",
            "Home: Mon, Mar 16 (all day) (UTC)",
        ]);
    });

    it("summarises how many calendars the item is on, for the accessible name", () => {
        expect(formatScheduleSummary([work])).toBe("Scheduled on 1 calendar. Work: Mon, Mar 16 09:00 (UTC)");
        expect(formatScheduleSummary([work, home])).toBe(
            "Scheduled on 2 calendars. Work: Mon, Mar 16 09:00 (UTC). Home: Mon, Mar 16 (all day) (UTC)",
        );
        expect(formatScheduleSummary([])).toBe("Not scheduled on any calendar");
    });
});
