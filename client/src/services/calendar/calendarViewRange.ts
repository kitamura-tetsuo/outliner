// The calendar's visible window as a query parameter
// (docs/crdt-sql-architecture.md §6.4).
//
// A calendar draws a window (a day, a week, a month) but its query returns
// everything it matches. `computeViewRange` turns the current view type and
// an anchor date into that window as a half-open interval [start, end) —
// the same exclusive-end convention the time model uses (§6.1) — so an entry
// exactly on a boundary lands in exactly one window, never both or neither.
//
// The window is injected into the query's session as `view.range_start` /
// `view.range_end` (`calendarQueryRunner.ts`), mirroring how the scheduler
// injects `job.occurrence` (`server/src/scheduler/worker.ts`). Filtering
// stays the query's own job — see `queryReferencesViewRange` below, used only
// to warn when a query never reads either setting.

/** Postgres setting names a calendar query reads via `current_setting(...)`. */
export const VIEW_RANGE_START_SETTING = "view.range_start";
export const VIEW_RANGE_END_SETTING = "view.range_end";

export interface CalendarRange {
    /** Inclusive start of the visible window. */
    start: Date;
    /** Exclusive end of the visible window. */
    end: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Compute the visible window for a view type and anchor date, as a
 * half-open interval in the anchor's local time. `weekStartsOn` (0 = Sunday)
 * defaults to Sunday; the locale-aware week-start setting is #4347's.
 *
 * Unrecognized view types (e.g. a future Gantt scale) fall back to "week" —
 * Gantt's own day/week/month/quarter axis scale is #4350's concern.
 */
export function computeViewRange(viewType: string, anchor: Date, weekStartsOn = 0): CalendarRange {
    const dayStart = startOfDay(anchor);

    if (viewType === "day") {
        return { start: dayStart, end: new Date(dayStart.getTime() + DAY_MS) };
    }

    if (viewType === "month") {
        const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
        return { start, end };
    }

    const dow = dayStart.getDay();
    const offset = (dow - weekStartsOn + 7) % 7;
    const start = new Date(dayStart.getTime() - offset * DAY_MS);
    const end = new Date(start.getTime() + 7 * DAY_MS);
    return { start, end };
}

/** Move the anchor date to the next/previous period for a view type. */
export function shiftAnchor(viewType: string, anchor: Date, direction: 1 | -1): Date {
    if (viewType === "day") return new Date(anchor.getTime() + direction * DAY_MS);
    if (viewType === "month") {
        return new Date(anchor.getFullYear(), anchor.getMonth() + direction, anchor.getDate());
    }
    return new Date(anchor.getTime() + direction * 7 * DAY_MS);
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
