// The calendar's visible window as a query parameter
// (docs/crdt-sql-architecture.md §6.4), computed in the view's timezone
// (§6.5).
//
// A calendar draws a window (a day, a week, a month) but its query returns
// everything it matches. `computeViewRange` turns the current view type and
// an anchor date into that window as a half-open interval [start, end) —
// the same exclusive-end convention the time model uses (§6.1) — so an entry
// exactly on a boundary lands in exactly one window, never both or neither.
//
// The window must be computed in the view's timezone, not the runtime's
// ambient one: two collaborators in different zones looking at a calendar
// with a *fixed* timezone must see the same window, and "midnight" for a
// day/week/month boundary means midnight in that zone, not in whichever
// zone happens to be running the browser. `$shared/utils/zonedTime` (built
// for calendar recurrence, #4343) already solves wall-clock <-> UTC
// conversion for an arbitrary IANA zone on native `Intl` alone, so it is
// reused here rather than duplicated.
//
// The window is injected into the query's session as `view.range_start` /
// `view.range_end` (`calendarQueryRunner.ts`), mirroring how the scheduler
// injects `job.occurrence` (`server/src/scheduler/worker.ts`). Filtering
// stays the query's own job — see `queryReferencesViewRange` below, used only
// to warn when a query never reads either setting.

import { utcMsToWallTime, wallTimeToUtcMs, type WallTime } from "$shared/utils/zonedTime";

/** Postgres setting names a calendar query reads via `current_setting(...)`. */
export const VIEW_RANGE_START_SETTING = "view.range_start";
export const VIEW_RANGE_END_SETTING = "view.range_end";

export interface CalendarRange {
    /** Inclusive start of the visible window. */
    start: Date;
    /** Exclusive end of the visible window. */
    end: Date;
}

function dateOnly(w: WallTime): WallTime {
    return { year: w.year, month: w.month, day: w.day, hour: 0, minute: 0, second: 0 };
}

/**
 * Add `deltaDays` calendar days to a wall date. This is pure calendar-date
 * arithmetic — no zone, no instant — the same "treat the reading as if it
 * were UTC" trick `zonedTime.ts` uses internally, safe here because a
 * calendar date has no DST or offset of its own.
 */
function addWallDays(w: WallTime, deltaDays: number): WallTime {
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day + deltaDays));
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: 0,
        minute: 0,
        second: 0,
    };
}

/** Day-of-week (0 = Sunday) of a wall date, independent of any zone. */
function wallDayOfWeek(w: WallTime): number {
    return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

function wallDateToInstant(w: WallTime, timeZone: string): Date {
    return new Date(wallTimeToUtcMs(w, timeZone));
}

/**
 * Compute the visible window for a view type and anchor instant, as a
 * half-open interval in `timeZone`'s wall clock. `weekStartsOn` (0 = Sunday)
 * defaults to Sunday; the locale-aware week-start setting is #4347's.
 *
 * Unrecognized view types (e.g. a future Gantt scale) fall back to "week" —
 * Gantt's own day/week/month/quarter axis scale is #4350's concern.
 */
export function computeViewRange(viewType: string, anchor: Date, timeZone: string, weekStartsOn = 0): CalendarRange {
    const wallAnchor = dateOnly(utcMsToWallTime(anchor.getTime(), timeZone));

    if (viewType === "day") {
        return {
            start: wallDateToInstant(wallAnchor, timeZone),
            end: wallDateToInstant(addWallDays(wallAnchor, 1), timeZone),
        };
    }

    if (viewType === "month") {
        const startWall: WallTime = { ...wallAnchor, day: 1 };
        const endWall: WallTime = wallAnchor.month === 12
            ? { year: wallAnchor.year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
            : { year: wallAnchor.year, month: wallAnchor.month + 1, day: 1, hour: 0, minute: 0, second: 0 };
        return { start: wallDateToInstant(startWall, timeZone), end: wallDateToInstant(endWall, timeZone) };
    }

    const offset = (wallDayOfWeek(wallAnchor) - weekStartsOn + 7) % 7;
    const startWall = addWallDays(wallAnchor, -offset);
    const endWall = addWallDays(startWall, 7);
    return { start: wallDateToInstant(startWall, timeZone), end: wallDateToInstant(endWall, timeZone) };
}

/**
 * Move the anchor to the next/previous period for a view type, in
 * `timeZone`'s wall clock — so navigation lands on the same calendar date for
 * every viewer of a calendar with a fixed timezone, regardless of each
 * viewer's own local zone.
 */
export function shiftAnchor(viewType: string, anchor: Date, direction: 1 | -1, timeZone: string): Date {
    const wallAnchor = dateOnly(utcMsToWallTime(anchor.getTime(), timeZone));

    if (viewType === "month") {
        let month = wallAnchor.month - 1 + direction;
        let year = wallAnchor.year;
        if (month < 0) {
            month += 12;
            year -= 1;
        } else if (month > 11) {
            month -= 12;
            year += 1;
        }
        return wallDateToInstant({ ...wallAnchor, year, month: month + 1 }, timeZone);
    }

    const deltaDays = viewType === "day" ? direction : direction * 7;
    return wallDateToInstant(addWallDays(wallAnchor, deltaDays), timeZone);
}

/**
 * Textual, deliberately shallow check for whether a query references either
 * injected setting — used only to warn, never to block execution. A query
 * that builds the setting name dynamically produces a false negative (a
 * spurious warning), which is the accepted trade-off against hand-parsing SQL.
 */
export function queryReferencesViewRange(query: string): boolean {
    return query.includes(VIEW_RANGE_START_SETTING) || query.includes(VIEW_RANGE_END_SETTING);
}
