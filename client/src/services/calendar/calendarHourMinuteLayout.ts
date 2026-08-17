// Pure geometry for the single-day "Hour Map" view (#4972): the y axis is one
// row per wall-clock hour, and the x axis *inside* a row is that hour's
// minutes (00..60). A timed entry is therefore not one block but a sequence of
// per-hour fragments — a narrow text box folded every hour — so a 09:45-11:20
// meeting reads as three connected pieces on the 09, 10 and 11 rows.
//
// Two rules follow from that coordinate system and shape everything below:
//
//  1. Horizontal extent *is* elapsed minutes. It is never repurposed for
//     overlap layout the way calendarTimeGridLayout.ts's `assignOverlapColumns`
//     splits a day column — halving a full-hour event's width would make it
//     read as a 30-minute event. Overlaps stack into vertical sub-lanes within
//     the affected rows instead, so only those rows grow taller.
//  2. Lanes are assigned once over the whole visible day, not per hour, so a
//     multi-hour event keeps the same lane in every row it touches and its
//     fragments still read as one wrapped event. Non-overlapping events do
//     reuse a lane (greedy first-fit, exactly like the time grid's per-cluster
//     columns, only global and vertical).
//
// Hour rows come from the calendar's own timezone, never from `dayStart + h *
// 3_600_000`: on a DST transition day a local day is 23 or 25 hours long, and
// fixed UTC-hour arithmetic would silently shift every row after the
// transition. See `computeHourRows` for what each transition does to the rows.

import { utcMsToWallTime, wallTimeExists, wallTimeToUtcMs } from "$shared/utils/zonedTime";
import type { CalendarEntry } from "./calendarEntries";

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_TIMED_DURATION_MS = 30 * MINUTE_MS;
const MIN_TIMED_DURATION_MS = MINUTE_MS;

/**
 * How many minutes wide a fragment must be before an inline title is drawn in
 * it. A documented threshold rather than per-glyph measurement: title
 * selection has to be deterministic and testable in the pure layout, and the
 * renderer's own ellipsis handles the rest. 15 minutes is a quarter of a row.
 */
export const MIN_TITLE_FRAGMENT_MINUTES = 15;

/** One wall-clock hour row of the map. */
export interface HourMinuteRow {
    /** Position of this row in `HourMinuteLayout.rows`. Equals `hour` except on a spring-forward day. */
    rowIndex: number;
    /** Wall-clock hour label, 0..23. */
    hour: number;
    /** UTC instant at which this row's wall-clock hour begins. */
    startUtcMs: number;
    /** UTC instant at which the next row begins (or the day ends). */
    endUtcMs: number;
    /**
     * Real minutes this row covers — 60 on an ordinary day. A fall-back
     * transition repeats a wall-clock hour, and both passes render in that one
     * row, so it reads 120 (see `isDstExpanded`); the minute axis stays
     * proportional to the row's own span, so nothing is lost or duplicated.
     */
    spanMinutes: number;
    /** True when this row absorbed a repeated wall-clock hour (fall back). */
    isDstExpanded: boolean;
    /** Vertical sub-lanes this row needs; 1 when nothing in it overlaps. */
    laneCount: number;
    /** This row's fragments, ordered by lane then start minute (deterministic). */
    fragments: HourMinuteFragment[];
    /** Working-hours overlay, in this row's minutes; undefined when the row is wholly outside it. */
    workingStartMinute?: number;
    workingEndMinute?: number;
}

/** One hour's worth of a timed entry. */
export interface HourMinuteFragment {
    entry: CalendarEntry;
    /** Wall-clock hour label of the row this fragment belongs to. */
    hour: number;
    /** Index of that row in `HourMinuteLayout.rows`. */
    rowIndex: number;
    /** Minutes from the row's start; 0..`spanMinutes`. */
    startMinute: number;
    /** Minutes from the row's start; always > `startMinute`. */
    endMinute: number;
    /** Vertical sub-lane, stable across every row this entry touches. */
    laneIndex: number;
    /** Sub-lanes in this fragment's own row, so the renderer can size it. */
    laneCount: number;
    /** First / last visible fragment of this entry in the day. */
    isFirst: boolean;
    isLast: boolean;
    /** Whether the inline title text is drawn in this fragment (at most one per entry). */
    showTitle: boolean;
    /**
     * The single fragment that carries this entry's accessible label, focus
     * and delete affordance: the titled one, or the first when no fragment is
     * wide enough for a title. Exactly one fragment per entry has it.
     */
    isTitleAnchor: boolean;
}

export interface HourMinuteLayout {
    rows: HourMinuteRow[];
    /** All-day entries overlapping the day — kept out of the hour geometry entirely. */
    allDay: CalendarEntry[];
    /** Due-only entries (no start) landing in the day, rendered as markers. */
    milestones: CalendarEntry[];
}

export interface HourMinuteLayoutOptions {
    /** Minutes from local midnight where the working-hours overlay starts. */
    workingHoursStartMinutes?: number;
    /** Minutes from local midnight where it ends. */
    workingHoursEndMinutes?: number;
}

/**
 * The visible day's wall-clock hour rows, in `timeZone`.
 *
 * Each candidate hour 00..23 is converted through the same DST-safe
 * conversion the grid range itself uses, and a row runs until the next
 * existing hour begins, so the rows always tile `[rangeStart, rangeEnd)`
 * exactly:
 *
 *  - ordinary day: 24 rows, 60 minutes each;
 *  - spring forward: the skipped wall hour has no row at all (its label never
 *    existed locally), so 23 rows — `rowIndex` and `hour` stop agreeing;
 *  - fall back: the repeated wall hour keeps one row, spanning both passes
 *    (`spanMinutes` 120, `isDstExpanded`). Rendering it as two rows would need
 *    two rows with the same `00`-`60` label; rendering only one pass would
 *    drop real events. Minute geometry inside it stays proportional to the
 *    row's span, so an event there is never placed at the wrong end of the
 *    hour — it is only drawn at half the usual minute scale.
 */
export function computeHourRows(rangeStart: number, rangeEnd: number, timeZone: string): HourMinuteRow[] {
    const dayWall = utcMsToWallTime(rangeStart, timeZone);
    const starts: { hour: number; startUtcMs: number; }[] = [];

    for (let hour = 0; hour < 24; hour++) {
        const wall = { ...dayWall, hour, minute: 0, second: 0 };
        if (!wallTimeExists(wall, timeZone)) continue; // spring-forward gap
        const startUtcMs = wallTimeToUtcMs(wall, timeZone);
        if (startUtcMs < rangeStart || startUtcMs >= rangeEnd) continue;
        if (starts.length > 0 && startUtcMs <= starts[starts.length - 1].startUtcMs) continue;
        starts.push({ hour, startUtcMs });
    }

    return starts.map((s, index) => {
        const endUtcMs = index + 1 < starts.length ? starts[index + 1].startUtcMs : rangeEnd;
        const spanMinutes = (endUtcMs - s.startUtcMs) / MINUTE_MS;
        return {
            rowIndex: index,
            hour: s.hour,
            startUtcMs: s.startUtcMs,
            endUtcMs,
            spanMinutes,
            isDstExpanded: spanMinutes > 60,
            laneCount: 1,
            fragments: [],
        };
    });
}

interface LaneItem {
    key: string;
    start: number;
    end: number;
}

/**
 * Greedy first-fit lane assignment over the whole visible day: each entry
 * takes the lowest lane whose last occupant has already ended. Overlapping
 * entries therefore never share a lane, non-overlapping ones do, and — because
 * the decision is made once per *entry* rather than once per hour — a
 * multi-hour entry keeps that lane in every row it touches.
 *
 * Deterministic: ties in start are broken by end, then by key.
 */
export function assignOverlapLanes(items: LaneItem[]): Map<string, number> {
    const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key));
    const laneEnds: number[] = [];
    const lanes = new Map<string, number>();

    for (const item of sorted) {
        let lane = laneEnds.findIndex((end) => end <= item.start);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(item.end);
        } else {
            laneEnds[lane] = item.end;
        }
        lanes.set(item.key, lane);
    }

    return lanes;
}

/** The working-hours overlay for one row, clipped to it; undefined when it misses the row. */
function workingBand(
    row: HourMinuteRow,
    startMinutes: number | undefined,
    endMinutes: number | undefined,
): { start: number; end: number; } | undefined {
    if (startMinutes === undefined || endMinutes === undefined) return undefined;
    const clamp = (v: number) => Math.max(0, Math.min(row.spanMinutes, v));
    const start = clamp(startMinutes - row.hour * 60);
    const end = clamp(endMinutes - row.hour * 60);
    return end > start ? { start, end } : undefined;
}

/**
 * Project `entries` onto the hour map of the single local day
 * `[rangeStart, rangeEnd)` (as computed by calendarGridRange.ts's `day`/`hours`
 * case, so it is already DST-correct).
 *
 * All-day entries and due-only milestones are returned separately and never
 * fragmented: they have no place on a minute axis (docs/crdt-sql-architecture.md
 * §6.1), exactly as in the time grid.
 */
export function layoutHourMinuteGrid(
    entries: CalendarEntry[],
    rangeStart: number,
    rangeEnd: number,
    timeZone: string,
    options: HourMinuteLayoutOptions = {},
): HourMinuteLayout {
    const rows = computeHourRows(rangeStart, rangeEnd, timeZone);
    const allDay: CalendarEntry[] = [];
    const milestones: CalendarEntry[] = [];
    const clipped: { entry: CalendarEntry; start: number; end: number; }[] = [];

    for (const entry of entries) {
        if (entry.startMs === undefined) {
            if (entry.dueMs !== undefined && entry.dueMs >= rangeStart && entry.dueMs < rangeEnd) {
                milestones.push(entry);
            }
            continue;
        }

        const start = entry.startMs;
        const minDuration = entry.allDay ? DAY_MS : MIN_TIMED_DURATION_MS;
        const duration = Math.max(entry.durationMs ?? (entry.allDay ? DAY_MS : DEFAULT_TIMED_DURATION_MS), minDuration);
        const end = start + duration;

        // Overlap idiom (§6.4): an entry starting before the window but
        // reaching into it still belongs to the day.
        if (!(start < rangeEnd && end > rangeStart)) continue;

        if (entry.allDay) {
            allDay.push(entry);
            continue;
        }

        clipped.push({ entry, start: Math.max(start, rangeStart), end: Math.min(end, rangeEnd) });
    }

    const lanes = assignOverlapLanes(clipped.map((c) => ({ key: c.entry.key, start: c.start, end: c.end })));

    for (const { entry, start, end } of clipped) {
        const laneIndex = lanes.get(entry.key) ?? 0;
        const pieces: HourMinuteFragment[] = [];

        for (const row of rows) {
            const fragStart = Math.max(start, row.startUtcMs);
            const fragEnd = Math.min(end, row.endUtcMs);
            if (fragEnd <= fragStart) continue;
            pieces.push({
                entry,
                hour: row.hour,
                rowIndex: row.rowIndex,
                startMinute: (fragStart - row.startUtcMs) / MINUTE_MS,
                endMinute: (fragEnd - row.startUtcMs) / MINUTE_MS,
                laneIndex,
                laneCount: 1, // filled in below, once the row's lanes are known
                isFirst: false,
                isLast: false,
                showTitle: false,
                isTitleAnchor: false,
            });
        }

        if (pieces.length === 0) continue;
        pieces[0].isFirst = true;
        pieces[pieces.length - 1].isLast = true;

        // Title once per entry: the earliest fragment with room for it. When
        // none has room the entry stays untitled inline (hover/focus still
        // expose it) and its first fragment anchors focus instead.
        const titled = pieces.find((p) => p.endMinute - p.startMinute >= MIN_TITLE_FRAGMENT_MINUTES);
        if (titled) titled.showTitle = true;
        (titled ?? pieces[0]).isTitleAnchor = true;

        for (const piece of pieces) rows[piece.rowIndex].fragments.push(piece);
    }

    for (const row of rows) {
        row.laneCount = row.fragments.reduce((max, f) => Math.max(max, f.laneIndex + 1), 1);
        for (const fragment of row.fragments) fragment.laneCount = row.laneCount;
        row.fragments.sort((a, b) => a.laneIndex - b.laneIndex || a.startMinute - b.startMinute);
        const band = workingBand(row, options.workingHoursStartMinutes, options.workingHoursEndMinutes);
        row.workingStartMinute = band?.start;
        row.workingEndMinute = band?.end;
    }

    return { rows, allDay, milestones };
}

/** Where an instant sits on the map: which row, and how many minutes into it. */
export function locateInstant(rows: HourMinuteRow[], utcMs: number): { rowIndex: number; minuteOffset: number; } {
    if (rows.length === 0) return { rowIndex: 0, minuteOffset: 0 };
    let rowIndex = 0;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].startUtcMs <= utcMs) rowIndex = i;
        else break;
    }
    return { rowIndex, minuteOffset: (utcMs - rows[rowIndex].startUtcMs) / MINUTE_MS };
}

/** The instant a row index starts at, extrapolating by whole hours past either end of the day. */
function rowStartFor(rows: HourMinuteRow[], index: number): number {
    if (index < 0) return rows[0].startUtcMs + index * HOUR_MS;
    if (index >= rows.length) return rows[rows.length - 1].endUtcMs + (index - rows.length) * HOUR_MS;
    return rows[index].startUtcMs;
}

/**
 * Move `utcMs` by `deltaRows` hour rows and `deltaMinutes` minutes, resolving
 * both into one continuous wall-clock instant.
 *
 * Crossing an hour's left/right edge continues naturally into the neighbouring
 * hour rather than clamping — a 10:50 start dragged 20 minutes later becomes
 * 11:10, because the minute offset is simply added to the row's own start
 * instant and rows tile the day without gaps. Dragging past the first/last row
 * extrapolates by whole hours into the adjacent day, which the caller's
 * ordinary start/duration write then handles like any other value.
 */
export function shiftInstant(
    rows: HourMinuteRow[],
    utcMs: number,
    deltaRows: number,
    deltaMinutes: number,
): number {
    if (rows.length === 0) return utcMs + deltaRows * HOUR_MS + deltaMinutes * MINUTE_MS;
    const { rowIndex, minuteOffset } = locateInstant(rows, utcMs);
    return rowStartFor(rows, rowIndex + deltaRows) + (minuteOffset + deltaMinutes) * MINUTE_MS;
}
