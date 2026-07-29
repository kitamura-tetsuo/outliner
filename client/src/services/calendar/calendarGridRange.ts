// Computes the visible window for a calendar's time-grid views (day /
// multi-day / week / month), in the calendar's own timezone.
//
// A calendar carries an explicit `timezone` setting (calendarService.ts,
// shipped by #4344/#4358) which defaults to the viewer's local zone when
// unset. Grid boundaries must be computed in that zone, not the runtime's
// ambient one — two viewers of a calendar with a fixed timezone must agree on
// where a day starts (docs/crdt-sql-architecture.md §6.5). This reuses the
// DST-safe wall-clock <-> UTC conversion `shared/src/utils/zonedTime.ts`
// already built for recurrence expansion (#4343), rather than the runtime's
// own `Date` methods (which are always in the *runtime's* local zone).

import {
    floatingDateToWallTime,
    utcMsToWallTime,
    wallTimeToFloatingDate,
    wallTimeToUtcMs,
} from "$shared/utils/zonedTime";

export type CalendarViewType = "day" | "days" | "week" | "month";

/**
 * Gantt's own axis granularity (#4350), independent of `CalendarViewType`:
 * which tick the horizontal axis is drawn in. "The chosen scale sets the
 * visible span" (docs/crdt-sql-architecture.md §6.7) — each scale pairs a
 * tick unit with a span wide enough to show a useful number of ticks, so a
 * coarser scale asks the engine for more time but never for "everything".
 */
export type GanttScale = "day" | "week" | "month" | "quarter";

export const DEFAULT_GANTT_SCALE: GanttScale = "day";

/** Total visible span for each scale, in whole days. */
const GANTT_SCALE_SPAN_DAYS: Record<GanttScale, number> = {
    day: 30, // ~1 month of day columns
    week: 90, // ~1 quarter of week columns
    month: 365, // ~1 year of month columns
    quarter: 730, // ~8 quarters (2 years) of quarter columns
};

const DAY_MS = 86_400_000;

export interface ViewRange {
    /** Inclusive lower bound, a UTC instant. */
    start: number;
    /** Exclusive upper bound, a UTC instant. */
    end: number;
}

/** The viewer's own IANA zone, used when a calendar has no fixed timezone. */
export function resolveViewerTimeZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

/** Resolve a calendar's effective timezone: its own setting, or the viewer's. */
export function resolveCalendarTimeZone(timezone: string | undefined): string {
    return timezone && timezone.trim() !== "" ? timezone : resolveViewerTimeZone();
}

function startOfWallDay(utcMs: number, timeZone: string): number {
    const w = utcMsToWallTime(utcMs, timeZone);
    return wallTimeToUtcMs({ ...w, hour: 0, minute: 0, second: 0 }, timeZone);
}

/** Add `days` calendar days to a wall-clock midnight instant, in `timeZone`. */
function addWallDays(midnightUtcMs: number, days: number, timeZone: string): number {
    const w = utcMsToWallTime(midnightUtcMs, timeZone);
    // Wall-clock day arithmetic is done on a "floating" Date (its UTC fields
    // read as the wall-clock fields — see zonedTime.ts) so adding a day never
    // has to reason about the zone's own DST transitions; only the final
    // wallTimeToUtcMs conversion does, correctly landing on that day's local
    // midnight even if the previous midnight had a different UTC offset.
    const floating = wallTimeToFloatingDate(w);
    floating.setUTCDate(floating.getUTCDate() + days);
    return wallTimeToUtcMs(floatingDateToWallTime(floating), timeZone);
}

/** 0 (Sunday) .. 6 (Saturday) weekday of a wall-clock midnight instant. */
function wallWeekday(midnightUtcMs: number, timeZone: string): number {
    return wallTimeToFloatingDate(utcMsToWallTime(midnightUtcMs, timeZone)).getUTCDay();
}

/**
 * The visible window for `viewType`, anchored at `anchorUtcMs`, in
 * `timeZone`. `weekStart` (0=Sunday..6=Saturday) applies to both the week
 * view and month view's leading/trailing padding, so the grid always shows
 * whole weeks.
 *
 * Half-open: `[start, end)`. This is what gets injected as
 * `view.range_start`/`view.range_end` once the calendar query runner wires
 * it up (docs/crdt-sql-architecture.md §6.4) — the month case therefore
 * covers the *displayed* grid (padded to whole weeks), not just the calendar
 * month, so nothing drawn falls outside the queried range.
 */
export function computeViewRange(
    anchorUtcMs: number,
    viewType: CalendarViewType,
    weekStart: number,
    timeZone: string,
    dayCount = 3,
): ViewRange {
    const dayStart = startOfWallDay(anchorUtcMs, timeZone);

    switch (viewType) {
        case "day":
            return { start: dayStart, end: addWallDays(dayStart, 1, timeZone) };
        case "days":
            return { start: dayStart, end: addWallDays(dayStart, Math.max(1, dayCount), timeZone) };
        case "week": {
            const weekday = wallWeekday(dayStart, timeZone);
            const back = (weekday - weekStart + 7) % 7;
            const start = addWallDays(dayStart, -back, timeZone);
            return { start, end: addWallDays(start, 7, timeZone) };
        }
        case "month": {
            const w = utcMsToWallTime(anchorUtcMs, timeZone);
            const firstOfMonth = wallTimeToUtcMs({ ...w, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
            const firstOfNextMonth = wallTimeToUtcMs(
                { ...w, month: w.month + 1, day: 1, hour: 0, minute: 0, second: 0 },
                timeZone,
            );
            const leadWeekday = wallWeekday(firstOfMonth, timeZone);
            const leadBack = (leadWeekday - weekStart + 7) % 7;
            const gridStart = addWallDays(firstOfMonth, -leadBack, timeZone);

            const lastDay = addWallDays(firstOfNextMonth, -1, timeZone);
            const trailWeekday = wallWeekday(lastDay, timeZone);
            const trailForward = (weekStart - 1 - trailWeekday + 7) % 7;
            const gridEnd = addWallDays(lastDay, trailForward + 1, timeZone);

            return { start: gridStart, end: gridEnd };
        }
    }
}

/**
 * Move the anchor to the next/previous period, landing on that period's own
 * local midnight — day/days/week step by a fixed number of days; month steps
 * by a calendar month (never by the padded grid's day count, which varies
 * with how a month's leading/trailing weeks line up).
 */
export function shiftAnchor(
    anchorUtcMs: number,
    viewType: CalendarViewType,
    weekStart: number,
    timeZone: string,
    direction: 1 | -1,
    dayCount = 3,
): number {
    const dayStart = startOfWallDay(anchorUtcMs, timeZone);
    switch (viewType) {
        case "day":
            return addWallDays(dayStart, direction * 1, timeZone);
        case "days":
            return addWallDays(dayStart, direction * Math.max(1, dayCount), timeZone);
        case "week":
            return addWallDays(dayStart, direction * 7, timeZone);
        case "month": {
            const w = utcMsToWallTime(anchorUtcMs, timeZone);
            return wallTimeToUtcMs(
                { ...w, month: w.month + direction, day: 1, hour: 0, minute: 0, second: 0 },
                timeZone,
            );
        }
    }
}

/** Today's date at local midnight, in `timeZone`, as a UTC instant. */
export function todayAnchor(timeZone: string, nowUtcMs: number): number {
    return startOfWallDay(nowUtcMs, timeZone);
}

/**
 * The Gantt chart's visible window (§6.7): `GANTT_SCALE_SPAN_DAYS[scale]`
 * whole days starting at the anchor's local midnight, in `timeZone`. Half-open
 * `[start, end)`, the same convention every other range in this module uses,
 * so it injects into `view.range_start`/`view.range_end` (#4345) exactly like
 * the time-grid views' own range.
 */
export function computeGanttRange(anchorUtcMs: number, scale: GanttScale, timeZone: string): ViewRange {
    const start = startOfWallDay(anchorUtcMs, timeZone);
    return { start, end: addWallDays(start, GANTT_SCALE_SPAN_DAYS[scale], timeZone) };
}

/** One tick's worth of calendar days, for `shiftGanttAnchor` and axis-tick generation. */
function ganttTickDays(scale: GanttScale, anchorUtcMs: number, timeZone: string): number {
    switch (scale) {
        case "day":
            return 1;
        case "week":
            return 7;
        case "quarter":
            return 91; // a fixed-width approximation; tick boundaries below still snap to real month starts
        case "month": {
            const w = utcMsToWallTime(anchorUtcMs, timeZone);
            const thisMonth = wallTimeToUtcMs({ ...w, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
            const nextMonth = wallTimeToUtcMs(
                { ...w, month: w.month + 1, day: 1, hour: 0, minute: 0, second: 0 },
                timeZone,
            );
            return Math.round((nextMonth - thisMonth) / DAY_MS);
        }
    }
}

/** Move the Gantt anchor by one tick of `scale`, in `timeZone`'s wall clock. */
export function shiftGanttAnchor(anchorUtcMs: number, scale: GanttScale, timeZone: string, direction: 1 | -1): number {
    const dayStart = startOfWallDay(anchorUtcMs, timeZone);
    return addWallDays(dayStart, direction * ganttTickDays(scale, dayStart, timeZone), timeZone);
}

export interface GanttTick {
    /** Local midnight of this tick's start, as a UTC instant. */
    startUtcMs: number;
    /** Human label for the axis header (e.g. "Mar 16", "Week of Mar 16", "March 2026", "Q1 2026"). */
    label: string;
}

/**
 * Tick boundaries across `[rangeStart, rangeEnd)`, in `timeZone`'s wall
 * clock — month and quarter ticks snap to real calendar-month/quarter
 * starts rather than a fixed day count, so "March" is always the whole of
 * March regardless of how many days it has.
 */
export function computeGanttTicks(
    rangeStart: number,
    rangeEnd: number,
    scale: GanttScale,
    timeZone: string,
): GanttTick[] {
    const ticks: GanttTick[] = [];
    let cursor = rangeStart;
    let guard = 0;
    while (cursor < rangeEnd && guard < 1000) {
        guard++;
        const w = utcMsToWallTime(cursor, timeZone);
        if (scale === "day") {
            ticks.push({ startUtcMs: cursor, label: `${w.month}/${w.day}` });
            cursor = addWallDays(cursor, 1, timeZone);
        } else if (scale === "week") {
            ticks.push({ startUtcMs: cursor, label: `${w.month}/${w.day}` });
            cursor = addWallDays(cursor, 7, timeZone);
        } else if (scale === "month") {
            ticks.push({ startUtcMs: cursor, label: `${w.year}-${String(w.month).padStart(2, "0")}` });
            cursor = wallTimeToUtcMs({ ...w, month: w.month + 1, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
        } else {
            const quarter = Math.floor((w.month - 1) / 3) + 1;
            ticks.push({ startUtcMs: cursor, label: `Q${quarter} ${w.year}` });
            const nextQuarterMonth = quarter * 3 + 1;
            cursor = nextQuarterMonth > 12
                ? wallTimeToUtcMs({
                    ...w,
                    year: w.year + 1,
                    month: nextQuarterMonth - 12,
                    day: 1,
                    hour: 0,
                    minute: 0,
                    second: 0,
                }, timeZone)
                : wallTimeToUtcMs({ ...w, month: nextQuarterMonth, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
        }
    }
    return ticks;
}
