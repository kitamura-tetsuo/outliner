import { beforeEach, describe, expect, it } from "vitest";
import {
    type CalendarMembership,
    calendarScheduleIndex,
    type ScheduleOccurrence,
    selectRelevantOccurrences,
    toScheduleOccurrence,
} from "./calendarScheduleIndex.svelte";

const HOUR = 3_600_000;

function occurrence(entryKey: string, startMs?: number, extra: Partial<ScheduleOccurrence> = {}): ScheduleOccurrence {
    return { entryKey, title: entryKey, startMs, ...extra };
}

function membership(
    calendarId: string,
    calendarName: string,
    occurrences: ScheduleOccurrence[],
    hiddenOccurrenceCount = 0,
    timeZone = "UTC",
): CalendarMembership {
    return { calendarId, calendarName, timeZone, occurrences, hiddenOccurrenceCount };
}

// The index is a module-scoped singleton (AGENTS.md: reset it per test rather
// than re-importing the module).
beforeEach(() => calendarScheduleIndex.reset());

describe("toScheduleOccurrence", () => {
    it("carries the entry key so two occurrences of one item never collapse", () => {
        const first = toScheduleOccurrence({
            key: "items:a:occ-1",
            sourceKind: "items",
            sourceId: "a",
            title: "Standup",
            allDay: false,
            startMs: 1000,
            durationMs: 1800,
            raw: {},
        });
        const second = toScheduleOccurrence({
            key: "items:a:occ-2",
            sourceKind: "items",
            sourceId: "a",
            title: "Standup",
            allDay: false,
            startMs: 1000 + 24 * HOUR,
            durationMs: 1800,
            raw: {},
        });
        expect(first.entryKey).not.toBe(second.entryKey);
        expect(first).toMatchObject({ title: "Standup", startMs: 1000, durationMs: 1800, allDay: false });
    });
});

describe("selectRelevantOccurrences", () => {
    it("keeps everything, in chronological order, below the limit", () => {
        const selected = selectRelevantOccurrences(
            [occurrence("b", 3 * HOUR), occurrence("a", 1 * HOUR)],
            0,
            3,
        );
        expect(selected.occurrences.map((o) => o.entryKey)).toEqual(["a", "b"]);
        expect(selected.hiddenOccurrenceCount).toBe(0);
    });

    it("windows onto the current and upcoming occurrences, counting the rest", () => {
        const now = 10 * HOUR;
        const all = [1, 4, 8, 11, 14, 20].map((h) => occurrence(`h${h}`, h * HOUR));
        const selected = selectRelevantOccurrences(all, now, 3);
        expect(selected.occurrences.map((o) => o.entryKey)).toEqual(["h11", "h14", "h20"]);
        expect(selected.hiddenOccurrenceCount).toBe(3);
    });

    it("keeps an occurrence that is running right now", () => {
        const now = 10 * HOUR;
        const all = [
            occurrence("running", 9 * HOUR, { durationMs: 2 * HOUR }),
            occurrence("later", 12 * HOUR),
            occurrence("latest", 15 * HOUR),
            occurrence("past", 1 * HOUR),
        ];
        const selected = selectRelevantOccurrences(all, now, 2);
        expect(selected.occurrences.map((o) => o.entryKey)).toEqual(["running", "later"]);
        expect(selected.hiddenOccurrenceCount).toBe(2);
    });

    it("sorts an occurrence with no time at all last, and uses due when there is no start", () => {
        const selected = selectRelevantOccurrences(
            [occurrence("undated"), occurrence("due-only", undefined, { dueMs: 5 * HOUR })],
            0,
            5,
        );
        expect(selected.occurrences.map((o) => o.entryKey)).toEqual(["due-only", "undated"]);
    });
});

describe("calendarScheduleIndex", () => {
    it("indexes by source item, keeps every calendar, and reconciles on republish", () => {
        const workSource = { calendarId: "cal-work", calendarName: "Work", timeZone: "UTC" };
        calendarScheduleIndex.publishCalendar(
            workSource,
            new Map([["item-1", membership("cal-work", "Work", [occurrence("e1", HOUR)])]]),
        );
        const homeSource = { calendarId: "cal-home", calendarName: "Home", timeZone: "Asia/Tokyo" };
        calendarScheduleIndex.publishCalendar(
            homeSource,
            new Map([
                ["item-1", membership("cal-home", "Home", [occurrence("e2", 2 * HOUR)], 0, "Asia/Tokyo")],
                ["item-2", membership("cal-home", "Home", [occurrence("e3", 3 * HOUR)], 0, "Asia/Tokyo")],
            ]),
        );

        // Two calendars for one item: both memberships, name-sorted, neither collapsed.
        expect(calendarScheduleIndex.lookupItem("item-1").map((m) => m.calendarName)).toEqual(["Home", "Work"]);
        expect(calendarScheduleIndex.lookupItem("item-1")[0].timeZone).toBe("Asia/Tokyo");
        expect(calendarScheduleIndex.lookupItem("item-2").map((m) => m.calendarId)).toEqual(["cal-home"]);
        expect(calendarScheduleIndex.lookupItem("item-3")).toEqual([]);

        // An item that dropped out of one calendar's result loses only that membership.
        calendarScheduleIndex.publishCalendar(
            homeSource,
            new Map([["item-2", membership("cal-home", "Home", [occurrence("e3", 3 * HOUR)], 0, "Asia/Tokyo")]]),
        );
        expect(calendarScheduleIndex.lookupItem("item-1").map((m) => m.calendarName)).toEqual(["Work"]);

        // Updated scheduling data replaces the previous occurrence in place.
        calendarScheduleIndex.publishCalendar(
            workSource,
            new Map([["item-1", membership("cal-work", "Work", [occurrence("e1", 9 * HOUR)])]]),
        );
        expect(calendarScheduleIndex.lookupItem("item-1")[0].occurrences[0].startMs).toBe(9 * HOUR);
    });

    it("bumps its version only when something actually changed", () => {
        const source = { calendarId: "cal-work", calendarName: "Work", timeZone: "UTC" };
        const memberships = new Map([["item-1", membership("cal-work", "Work", [occurrence("e1", HOUR)])]]);
        calendarScheduleIndex.publishCalendar(source, memberships);
        const version = calendarScheduleIndex.version;
        calendarScheduleIndex.publishCalendar(
            source,
            new Map([["item-1", membership("cal-work", "Work", [occurrence("e1", HOUR)])]]),
        );
        expect(calendarScheduleIndex.version).toBe(version);

        calendarScheduleIndex.publishCalendar(
            source,
            new Map([["item-1", membership("cal-work", "Work", [occurrence("e1", 2 * HOUR)])]]),
        );
        expect(calendarScheduleIndex.version).toBeGreaterThan(version);
    });

    it("removes a deleted calendar's memberships and retains only the surviving calendars", () => {
        calendarScheduleIndex.publishCalendar(
            { calendarId: "cal-a", calendarName: "A", timeZone: "UTC" },
            new Map([["item-1", membership("cal-a", "A", [occurrence("e1", HOUR)])]]),
        );
        calendarScheduleIndex.publishCalendar(
            { calendarId: "cal-b", calendarName: "B", timeZone: "UTC" },
            new Map([["item-1", membership("cal-b", "B", [occurrence("e2", HOUR)])]]),
        );

        calendarScheduleIndex.removeCalendar("cal-a");
        expect(calendarScheduleIndex.lookupItem("item-1").map((m) => m.calendarId)).toEqual(["cal-b"]);

        calendarScheduleIndex.retainCalendars(["cal-a"]);
        expect(calendarScheduleIndex.lookupItem("item-1")).toEqual([]);
    });

    it("publishing an empty result clears the calendar's contribution", () => {
        const source = { calendarId: "cal-a", calendarName: "A", timeZone: "UTC" };
        calendarScheduleIndex.publishCalendar(
            source,
            new Map([["item-1", membership("cal-a", "A", [occurrence("e1", HOUR)])]]),
        );
        calendarScheduleIndex.publishCalendar(source, new Map());
        expect(calendarScheduleIndex.lookupItem("item-1")).toEqual([]);
    });
});
