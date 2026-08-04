import { describe, expect, it } from "vitest";
import {
    excludeOverriddenOccurrences,
    expandRecurrence,
    type RecurrenceRule,
} from "../../src/services/calendarRecurrenceExpansion";

const baseRule: RecurrenceRule = {
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    dtstart: "2026-08-03T09:00:00", // a Monday
    timezone: "UTC",
};

const ms = (iso: string) => Date.parse(iso);

describe("expandRecurrence", () => {
    it("expands to occurrences across the visible range, and nothing outside it", () => {
        // The range's own end (2026-08-31T00:00Z) is before that day's 09:00
        // occurrence, so it is correctly excluded — the range is a real
        // instant boundary, not "the whole of August 31".
        const occurrences = expandRecurrence(baseRule, ms("2026-08-01T00:00:00Z"), ms("2026-08-31T00:00:00Z"));
        expect(occurrences.map((o) => o.occurrenceId)).toEqual([
            "2026-08-03T09:00:00",
            "2026-08-10T09:00:00",
            "2026-08-17T09:00:00",
            "2026-08-24T09:00:00",
        ]);

        // Nothing before the range and nothing after it.
        const narrowed = expandRecurrence(baseRule, ms("2026-08-11T00:00:00Z"), ms("2026-08-16T00:00:00Z"));
        expect(narrowed).toEqual([]);
    });

    it("stays 09:00 local on both sides of a DST boundary", () => {
        const rule: RecurrenceRule = {
            rrule: "FREQ=DAILY",
            dtstart: "2026-03-01T09:00:00",
            timezone: "America/New_York",
        };
        // US spring-forward is 2026-03-08.
        const before = expandRecurrence(rule, ms("2026-03-05T00:00:00Z"), ms("2026-03-06T00:00:00Z"));
        const after = expandRecurrence(rule, ms("2026-03-10T00:00:00Z"), ms("2026-03-11T00:00:00Z"));

        expect(before).toHaveLength(1);
        expect(before[0].occurrenceId).toBe("2026-03-05T09:00:00");
        expect(before[0].startUtcMs).toBe(ms("2026-03-05T14:00:00Z")); // EST, UTC-5

        expect(after).toHaveLength(1);
        expect(after[0].occurrenceId).toBe("2026-03-10T09:00:00");
        expect(after[0].startUtcMs).toBe(ms("2026-03-10T13:00:00Z")); // EDT, UTC-4
    });

    it("excludes an occurrence recorded in exdate", () => {
        const rule: RecurrenceRule = { ...baseRule, exdate: ["2026-08-10T09:00:00"] };
        const occurrences = expandRecurrence(rule, ms("2026-08-01T00:00:00Z"), ms("2026-08-15T00:00:00Z"));
        expect(occurrences.map((o) => o.occurrenceId)).toEqual(["2026-08-03T09:00:00"]);
    });

    it("a COUNT-bounded rule stops expanding at its bound", () => {
        const rule: RecurrenceRule = { ...baseRule, rrule: "FREQ=WEEKLY;BYDAY=MO;COUNT=2" };
        const occurrences = expandRecurrence(rule, ms("2026-08-01T00:00:00Z"), ms("2026-12-31T00:00:00Z"));
        expect(occurrences.map((o) => o.occurrenceId)).toEqual([
            "2026-08-03T09:00:00",
            "2026-08-10T09:00:00",
        ]);
    });

    it("an UNTIL-bounded rule stops expanding at its bound", () => {
        const rule: RecurrenceRule = { ...baseRule, rrule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260810T090000Z" };
        const occurrences = expandRecurrence(rule, ms("2026-08-01T00:00:00Z"), ms("2026-12-31T00:00:00Z"));
        expect(occurrences.map((o) => o.occurrenceId)).toEqual([
            "2026-08-03T09:00:00",
            "2026-08-10T09:00:00",
        ]);
    });

    it("includes a duration's tail even when the occurrence itself starts before the range", () => {
        const rule: RecurrenceRule = { ...baseRule, durationMs: 4 * 60 * 60 * 1000 }; // 4h
        // 2026-08-03T09:00 UTC + 4h ends 13:00 UTC, so a range starting at 10:00 still overlaps it.
        const occurrences = expandRecurrence(rule, ms("2026-08-03T10:00:00Z"), ms("2026-08-03T11:00:00Z"));
        expect(occurrences.map((o) => o.occurrenceId)).toEqual(["2026-08-03T09:00:00"]);
    });
});

describe("excludeOverriddenOccurrences", () => {
    it("drops a virtual occurrence an override already replaces", () => {
        const occurrences = expandRecurrence(baseRule, ms("2026-08-01T00:00:00Z"), ms("2026-08-15T00:00:00Z"));
        expect(occurrences).toHaveLength(2);

        const filtered = excludeOverriddenOccurrences(occurrences, [
            { recurrenceOccurrenceId: "2026-08-10T09:00:00" },
        ]);
        expect(filtered.map((o) => o.occurrenceId)).toEqual(["2026-08-03T09:00:00"]);
    });

    it("keeps every occurrence when there is no override", () => {
        const occurrences = expandRecurrence(baseRule, ms("2026-08-01T00:00:00Z"), ms("2026-08-15T00:00:00Z"));
        expect(excludeOverriddenOccurrences(occurrences, [])).toEqual(occurrences);
    });
});

it("rejects an invalid dtstart format gracefully", () => {
    const rule = {
        rrule: "FREQ=DAILY;COUNT=3",
        dtstart: "invalid-time",
        timezone: "America/New_York",
    };
    const occurrences = expandRecurrence(rule, Date.now() - 100000, Date.now() + 100000);
    expect(occurrences).toEqual([]);
});

it("handles durationMs being missing", () => {
    const start = "2024-03-01T10:00:00";
    const startMs = Date.UTC(2024, 2, 1, 15, 0, 0); // America/New_York is UTC-5
    const rule = {
        rrule: "FREQ=DAILY;COUNT=1",
        dtstart: start,
        timezone: "America/New_York",
    };

    const occurrences = expandRecurrence(rule, startMs - 1000, startMs + 1000);
    expect(occurrences[0].endUtcMs).toEqual(occurrences[0].startUtcMs);
});

it("handles rrule string parsing errors", () => {
    const rule = {
        rrule: "INVALID_RRULE_FORMAT",
        dtstart: "2024-03-01T10:00:00",
        timezone: "America/New_York",
    };
    const occurrences = expandRecurrence(rule, Date.now() - 100000, Date.now() + 100000);
    expect(occurrences).toEqual([]);
});

it("skips non-existent wall times", () => {
    const rule = {
        rrule: "FREQ=DAILY;COUNT=1",
        dtstart: "2024-03-10T02:30:00",
        timezone: "America/New_York",
    };
    const occurrences = expandRecurrence(rule, Date.UTC(2024, 2, 1), Date.UTC(2024, 2, 20));
    expect(occurrences).toEqual([]);
});
