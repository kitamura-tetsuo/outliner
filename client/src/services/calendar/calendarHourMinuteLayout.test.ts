import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./calendarEntries";
import {
    assignOverlapLanes,
    computeHourRows,
    layoutHourMinuteGrid,
    locateInstant,
    MIN_TITLE_FRAGMENT_MINUTES,
    shiftInstant,
} from "./calendarHourMinuteLayout";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const UTC = "UTC";
const RANGE_START = Date.parse("2026-03-10T00:00:00Z");
const RANGE_END = RANGE_START + DAY_MS;

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
    return { key: "k", title: "t", raw: {}, ...overrides };
}

function timed(key: string, start: string, durationMinutes: number, title = key): CalendarEntry {
    return entry({
        key,
        title,
        allDay: false,
        startMs: Date.parse(`2026-03-10T${start}:00Z`),
        durationMs: durationMinutes * MINUTE_MS,
    });
}

function layout(entries: CalendarEntry[], timeZone = UTC, start = RANGE_START, end = RANGE_END) {
    return layoutHourMinuteGrid(entries, start, end, timeZone);
}

function fragmentsOf(l: ReturnType<typeof layout>, key: string) {
    return l.rows.flatMap((row) => row.fragments).filter((f) => f.entry.key === key);
}

describe("computeHourRows", () => {
    it("tiles an ordinary local day into 24 sixty-minute rows labelled 00..23", () => {
        const rows = computeHourRows(RANGE_START, RANGE_END, UTC);
        expect(rows).toHaveLength(24);
        expect(rows.map((r) => r.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
        expect(rows.every((r) => r.spanMinutes === 60)).toBe(true);
        expect(rows[0].startUtcMs).toBe(RANGE_START);
        expect(rows[23].endUtcMs).toBe(RANGE_END);
        // Contiguous: every row ends where the next begins.
        for (let i = 1; i < rows.length; i++) expect(rows[i].startUtcMs).toBe(rows[i - 1].endUtcMs);
    });
});

describe("layoutHourMinuteGrid: fragmentation", () => {
    it("maps a sub-hour event to its exact minute range within one row", () => {
        const l = layout([timed("a", "09:10", 25)]);
        const frags = fragmentsOf(l, "a");
        expect(frags).toHaveLength(1);
        expect(frags[0].hour).toBe(9);
        expect(frags[0].startMinute).toBe(10);
        expect(frags[0].endMinute).toBe(35);
        expect(frags[0].isFirst).toBe(true);
        expect(frags[0].isLast).toBe(true);
    });

    it("splits 09:45-11:20 at hour boundaries into 09:45-10:00, 10:00-11:00 and 11:00-11:20", () => {
        const l = layout([timed("a", "09:45", 95)]);
        const frags = fragmentsOf(l, "a");
        expect(frags.map((f) => [f.hour, f.startMinute, f.endMinute])).toEqual([
            [9, 45, 60],
            [10, 0, 60],
            [11, 0, 20],
        ]);
        expect(frags.map((f) => f.isFirst)).toEqual([true, false, false]);
        expect(frags.map((f) => f.isLast)).toEqual([false, false, true]);
    });

    it("clips an event running past midnight to the visible day's last row", () => {
        const l = layout([timed("a", "23:30", 120)]);
        const frags = fragmentsOf(l, "a");
        expect(frags).toHaveLength(1);
        expect(frags[0].hour).toBe(23);
        expect(frags[0].endMinute).toBe(60);
    });

    it("clips an event that started the previous day to the day's first row", () => {
        const e = entry({
            key: "a",
            title: "Overnight",
            allDay: false,
            startMs: RANGE_START - 90 * MINUTE_MS,
            durationMs: 3 * HOUR_MS,
        });
        const frags = fragmentsOf(layout([e]), "a");
        expect(frags.map((f) => [f.hour, f.startMinute, f.endMinute])).toEqual([
            [0, 0, 60],
            [1, 0, 30],
        ]);
    });

    it("excludes an event outside the visible day entirely", () => {
        const e = entry({ key: "a", allDay: false, startMs: RANGE_END + HOUR_MS, durationMs: HOUR_MS });
        expect(fragmentsOf(layout([e]), "a")).toHaveLength(0);
    });
});

describe("layoutHourMinuteGrid: overlap lanes", () => {
    it("stacks overlapping events into vertical sub-lanes without narrowing either one", () => {
        const l = layout([timed("a", "10:00", 60), timed("b", "10:10", 40)]);
        const row = l.rows[10];
        expect(row.laneCount).toBe(2);
        const a = row.fragments.find((f) => f.entry.key === "a")!;
        const b = row.fragments.find((f) => f.entry.key === "b")!;
        expect(a.laneIndex).not.toBe(b.laneIndex);
        // Horizontal extent still means minutes: neither is halved.
        expect([a.startMinute, a.endMinute]).toEqual([0, 60]);
        expect([b.startMinute, b.endMinute]).toEqual([10, 50]);
    });

    it("only grows the rows that actually need extra lanes", () => {
        const l = layout([timed("a", "10:00", 60), timed("b", "10:10", 40), timed("c", "12:00", 30)]);
        expect(l.rows[10].laneCount).toBe(2);
        expect(l.rows[9].laneCount).toBe(1);
        expect(l.rows[12].laneCount).toBe(1);
    });

    it("lets non-overlapping events reuse the same lane", () => {
        const l = layout([timed("a", "09:00", 30), timed("b", "09:40", 20), timed("c", "11:00", 30)]);
        const lanes = ["a", "b", "c"].map((key) => fragmentsOf(l, key)[0].laneIndex);
        expect(lanes).toEqual([0, 0, 0]);
    });

    it("keeps a multi-hour event in one stable lane across every hour it touches", () => {
        // The long event starts second, so a per-hour assignment would be free
        // to shuffle it between lanes at each boundary.
        const l = layout([timed("short", "09:00", 30), timed("long", "09:10", 200), timed("mid", "11:00", 30)]);
        const longLanes = new Set(fragmentsOf(l, "long").map((f) => f.laneIndex));
        expect(fragmentsOf(l, "long")).toHaveLength(4); // 09, 10, 11, 12
        expect(longLanes.size).toBe(1);
    });

    it("is deterministic regardless of input order", () => {
        const entries = [timed("a", "09:00", 90), timed("b", "09:30", 90), timed("c", "10:00", 30)];
        const forward = layout(entries);
        const reversed = layout([...entries].reverse());
        const lanesOf = (l: ReturnType<typeof layout>) =>
            l.rows.flatMap((row) => row.fragments.map((f) => `${f.entry.key}@${f.hour}:${f.laneIndex}`));
        expect(lanesOf(reversed)).toEqual(lanesOf(forward));
    });

    it("never places two overlapping events in the same lane", () => {
        const lanes = assignOverlapLanes([
            { key: "a", start: 0, end: 100 },
            { key: "b", start: 50, end: 150 },
            { key: "c", start: 60, end: 80 },
        ]);
        expect(new Set([lanes.get("a"), lanes.get("b"), lanes.get("c")]).size).toBe(3);
    });
});

describe("layoutHourMinuteGrid: title placement", () => {
    it("renders the title in exactly one fragment of a multi-hour event", () => {
        const l = layout([timed("a", "09:45", 95, "Meeting")]);
        const frags = fragmentsOf(l, "a");
        expect(frags.filter((f) => f.showTitle)).toHaveLength(1);
        expect(frags[0].showTitle).toBe(true); // the first fragment is 15 minutes wide, which is enough
        expect(frags[0].isTitleAnchor).toBe(true);
    });

    it("moves the title to the earliest later fragment when the first is too narrow", () => {
        const l = layout([timed("a", "09:55", 85, "Meeting")]);
        const frags = fragmentsOf(l, "a");
        expect(frags[0].endMinute - frags[0].startMinute).toBeLessThan(MIN_TITLE_FRAGMENT_MINUTES);
        expect(frags.map((f) => f.showTitle)).toEqual([false, true, false]);
        // Focus/label follow the title rather than staying on the sliver.
        expect(frags.map((f) => f.isTitleAnchor)).toEqual([false, true, false]);
    });

    it("renders no inline title when no fragment is wide enough, anchoring on the first", () => {
        const l = layout([timed("a", "09:55", 10, "Standup")]);
        const frags = fragmentsOf(l, "a");
        expect(frags).toHaveLength(2);
        expect(frags.some((f) => f.showTitle)).toBe(false);
        expect(frags.map((f) => f.isTitleAnchor)).toEqual([true, false]);
    });
});

describe("layoutHourMinuteGrid: non-timed entries", () => {
    it("keeps all-day entries and due-only milestones out of the hour geometry", () => {
        const allDay = entry({ key: "ad", title: "Conference", allDay: true, startMs: RANGE_START });
        const milestone = entry({ key: "due", title: "Ship", dueMs: RANGE_START + 10 * HOUR_MS });
        const l = layout([allDay, milestone, timed("a", "09:00", 30)]);
        expect(l.allDay.map((e) => e.key)).toEqual(["ad"]);
        expect(l.milestones.map((e) => e.key)).toEqual(["due"]);
        expect(l.rows.flatMap((r) => r.fragments).map((f) => f.entry.key)).toEqual(["a"]);
    });

    it("ignores a milestone whose due falls outside the visible day", () => {
        const milestone = entry({ key: "due", dueMs: RANGE_END + HOUR_MS });
        expect(layout([milestone]).milestones).toHaveLength(0);
    });
});

describe("layoutHourMinuteGrid: working hours", () => {
    it("marks the working-hours interval proportionally on the boundary hour rows", () => {
        const l = layoutHourMinuteGrid([], RANGE_START, RANGE_END, UTC, {
            workingHoursStartMinutes: 9 * 60 + 30,
            workingHoursEndMinutes: 17 * 60,
        });
        expect(l.rows[8].workingStartMinute).toBeUndefined();
        expect([l.rows[9].workingStartMinute, l.rows[9].workingEndMinute]).toEqual([30, 60]);
        expect([l.rows[12].workingStartMinute, l.rows[12].workingEndMinute]).toEqual([0, 60]);
        expect(l.rows[17].workingStartMinute).toBeUndefined();
    });
});

describe("shiftInstant", () => {
    const rows = computeHourRows(RANGE_START, RANGE_END, UTC);
    const at = (hhmm: string) => Date.parse(`2026-03-10T${hhmm}:00Z`);

    it("locates an instant inside its own hour row", () => {
        expect(locateInstant(rows, at("10:50"))).toEqual({ rowIndex: 10, minuteOffset: 50 });
    });

    it("crosses the right edge of an hour naturally: 10:50 + 20 minutes is 11:10", () => {
        expect(shiftInstant(rows, at("10:50"), 0, 20)).toBe(at("11:10"));
    });

    it("crosses the left edge of an hour naturally: 10:10 - 20 minutes is 09:50", () => {
        expect(shiftInstant(rows, at("10:10"), 0, -20)).toBe(at("09:50"));
    });

    it("combines a vertical row step and a horizontal minute step into one instant", () => {
        expect(shiftInstant(rows, at("10:50"), 2, 20)).toBe(at("13:10"));
        expect(shiftInstant(rows, at("10:10"), -2, -20)).toBe(at("07:50"));
    });

    it("extrapolates past the day's edges instead of clamping", () => {
        expect(shiftInstant(rows, at("00:30"), -2, 0)).toBe(RANGE_START - 90 * MINUTE_MS);
        expect(shiftInstant(rows, at("23:30"), 2, 0)).toBe(RANGE_END + 90 * MINUTE_MS);
    });

    it("resizes across one or more hour boundaries by moving the end instant", () => {
        const start = at("09:50");
        // Drag a 20-minute event's end handle two rows down and 20 minutes
        // right: 10:10 -> 12:30, so the event now spans four hour rows.
        const grown = shiftInstant(rows, start + 20 * MINUTE_MS, 2, 20) - start;
        expect(grown).toBe(160 * MINUTE_MS);
        // Shrinking back across a boundary works the same way: a 12:10 end
        // dragged one row up and 20 minutes left becomes 10:50.
        const shrunk = shiftInstant(rows, start + 140 * MINUTE_MS, -1, -20) - start;
        expect(shrunk).toBe(60 * MINUTE_MS);
    });
});

describe("DST transition days", () => {
    const NY = "America/New_York";

    it("drops the skipped wall hour on a spring-forward day and still tiles the day", () => {
        // 2026-03-08: America/New_York jumps 02:00 -> 03:00, a 23-hour day.
        const start = Date.parse("2026-03-08T05:00:00Z"); // local midnight EST
        const end = Date.parse("2026-03-09T04:00:00Z"); // local midnight EDT (23h later)
        const rows = computeHourRows(start, end, NY);
        expect(end - start).toBe(23 * HOUR_MS);
        expect(rows).toHaveLength(23);
        expect(rows.map((r) => r.hour)).not.toContain(2);
        expect(rows.every((r) => r.spanMinutes === 60)).toBe(true);
        expect(rows[rows.length - 1].endUtcMs).toBe(end);
        for (let i = 1; i < rows.length; i++) expect(rows[i].startUtcMs).toBe(rows[i - 1].endUtcMs);
    });

    it("places an event after a spring-forward transition on its real wall-clock hour", () => {
        const start = Date.parse("2026-03-08T05:00:00Z");
        const end = Date.parse("2026-03-09T04:00:00Z");
        // 09:30 EDT = 13:30Z. Fixed `dayStart + 9 * 3_600_000` arithmetic would
        // land this on the 08 row instead.
        const e = entry({
            key: "a",
            title: "Brunch",
            allDay: false,
            startMs: Date.parse("2026-03-08T13:30:00Z"),
            durationMs: 30 * MINUTE_MS,
        });
        const l = layoutHourMinuteGrid([e], start, end, NY);
        const frag = l.rows.flatMap((r) => r.fragments)[0];
        expect(frag.hour).toBe(9);
        expect(frag.startMinute).toBe(30);
    });

    it("gives a repeated wall hour two full rows on a fall-back day, keeping the minute scale exact", () => {
        // 2026-11-01: America/New_York repeats 01:00, a 25-hour day.
        const start = Date.parse("2026-11-01T04:00:00Z"); // local midnight EDT
        const end = Date.parse("2026-11-02T05:00:00Z"); // local midnight EST (25h later)
        const rows = computeHourRows(start, end, NY);
        expect(end - start).toBe(25 * HOUR_MS);
        expect(rows).toHaveLength(25);
        const ones = rows.filter((r) => r.hour === 1);
        expect(ones).toHaveLength(2);
        // Never a double-width row: 120 real minutes drawn on a 60-minute axis
        // is exactly the "length lies about duration" failure this view avoids.
        expect(ones.every((r) => r.spanMinutes === 60 && r.startMinute === 0 && r.endMinute === 60)).toBe(true);
        expect(ones[0].isRepeatedHour).toBe(false);
        expect(ones[1].isRepeatedHour).toBe(true);
        expect(rows.filter((r) => r.isRepeatedHour)).toHaveLength(1);
        expect(rows[rows.length - 1].endUtcMs).toBe(end);
        for (let i = 1; i < rows.length; i++) expect(rows[i].startUtcMs).toBe(rows[i - 1].endUtcMs);
    });

    it("puts each pass of a repeated hour in its own row, at its own minute", () => {
        const start = Date.parse("2026-11-01T04:00:00Z");
        const end = Date.parse("2026-11-02T05:00:00Z");
        // 01:30 EDT (05:30Z) and 01:30 EST (06:30Z) are two distinct instants
        // that read the same on the wall clock.
        const first = entry({
            key: "edt",
            allDay: false,
            startMs: Date.parse("2026-11-01T05:30:00Z"),
            durationMs: 15 * MINUTE_MS,
        });
        const second = entry({
            key: "est",
            allDay: false,
            startMs: Date.parse("2026-11-01T06:30:00Z"),
            durationMs: 15 * MINUTE_MS,
        });
        const l = layoutHourMinuteGrid([first, second], start, end, NY);
        const rows = l.rows.filter((r) => r.hour === 1);
        expect(rows[0].fragments.map((f) => f.entry.key)).toEqual(["edt"]);
        expect(rows[1].fragments.map((f) => f.entry.key)).toEqual(["est"]);
        // Both at :30, both a quarter of the row wide — the true minute scale.
        expect(rows[0].fragments[0].startMinute).toBe(30);
        expect(rows[1].fragments[0].startMinute).toBe(30);
    });

    it("keeps the surviving part of a wall hour when a zone jumps mid-hour", () => {
        // Australia/Lord_Howe shifts by 30 minutes: on 2026-10-04 the clock
        // jumps 02:00 -> 02:30, so 02:00-02:29 never happens but 02:30-02:59
        // does. That half hour must stay on its own `02` row rather than being
        // dropped or absorbed into the `01` row below it.
        const LH = "Australia/Lord_Howe";
        const start = Date.parse("2026-10-03T13:30:00Z"); // local midnight, +10:30
        const end = Date.parse("2026-10-04T13:00:00Z"); // next local midnight, +11:00
        const rows = computeHourRows(start, end, LH);
        expect(end - start).toBe(23.5 * HOUR_MS);
        const hourOne = rows.find((r) => r.hour === 1)!;
        const hourTwo = rows.find((r) => r.hour === 2)!;
        expect([hourOne.startMinute, hourOne.endMinute]).toEqual([0, 60]);
        expect([hourTwo.startMinute, hourTwo.endMinute]).toEqual([30, 60]);
        expect(hourTwo.spanMinutes).toBe(30);
        for (let i = 1; i < rows.length; i++) expect(rows[i].startUtcMs).toBe(rows[i - 1].endUtcMs);

        // An event in the surviving half draws at its real wall minute.
        const e = entry({ key: "a", allDay: false, startMs: hourTwo.startUtcMs, durationMs: 15 * MINUTE_MS });
        const l = layoutHourMinuteGrid([e], start, end, LH);
        const frag = l.rows.flatMap((r) => r.fragments)[0];
        expect(frag.hour).toBe(2);
        expect([frag.startMinute, frag.endMinute]).toEqual([30, 45]);
    });

    it("shifts a start across a spring-forward gap without losing or gaining an hour", () => {
        const start = Date.parse("2026-03-08T05:00:00Z");
        const end = Date.parse("2026-03-09T04:00:00Z");
        const rows = computeHourRows(start, end, NY);
        // 01:30 EST (06:30Z) moved one row down is 03:30 EDT (07:30Z): the next
        // wall-clock row, one real hour later — not 02:30, which never existed.
        const moved = shiftInstant(rows, Date.parse("2026-03-08T06:30:00Z"), 1, 0);
        expect(moved).toBe(Date.parse("2026-03-08T07:30:00Z"));
    });
});
