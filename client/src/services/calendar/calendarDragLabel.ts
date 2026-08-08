// Destination labels for an in-flight calendar drag (#4535).
//
// Pure formatting only: every function here takes the *snapped* value the
// grid would actually write (the caller has already applied its own snapping
// — whole minutes in the time grid, whole days in Gantt) and renders it in
// the calendar's own timezone, never the viewer's local zone, so two
// collaborators dragging the same entry read the same label.

import { utcMsToWallTime } from "$shared/utils/zonedTime";
import type { CalendarEntry } from "./calendarEntries";

const DAY_MS = 86_400_000;
const DEFAULT_DURATION_MS = 30 * 60 * 1000;

/**
 * How precise the dragged value is. `"minute"` is the time grid (a start
 * instant); `"day"` is Gantt, whose drags snap to whole days and whose bars
 * therefore have no meaningful time-of-day to show.
 */
export type DragLabelGranularity = "minute" | "day";

export interface DragLabelOptions {
    granularity?: DragLabelGranularity;
    /**
     * The start the resize is anchored to, when it is not the entry's own
     * `startMs` — a Gantt row's bar can come from a recurrence occurrence
     * rather than the row's stored start.
     */
    startMs?: number;
}

export function formatDuration(durationMs: number): string {
    const minutes = Math.max(0, Math.round(durationMs / 60000));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
}

function formatDayCount(durationMs: number): string {
    const days = Math.max(1, Math.round(durationMs / DAY_MS));
    return `${days} day${days === 1 ? "" : "s"}`;
}

function formatShiftDays(deltaMs: number): string {
    const days = Math.round(deltaMs / DAY_MS);
    if (days > 0) return `+${days} day${days === 1 ? "" : "s"}`;
    if (days < 0) return `${days} day${days === -1 ? "" : "s"}`;
    return "0 days";
}

/** `Mon, Aug 3` in the calendar's zone. */
export function formatZonedDate(utcMs: number, timeZone: string): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(new Date(utcMs));
}

/** `09:15` in the calendar's zone, 24-hour so the label never doubles in width. */
export function formatZonedTime(utcMs: number, timeZone: string): string {
    const w = utcMsToWallTime(utcMs, timeZone);
    return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

/**
 * The destination of a move drag: `Mon, Aug 3 09:15 – 09:45` for a timed
 * entry, the date alone for an all-day entry or a day-granularity drag.
 */
export function formatDragMoveLabel(
    entry: CalendarEntry,
    newStartMs: number,
    timeZone: string,
    options: DragLabelOptions = {},
): string {
    const date = formatZonedDate(newStartMs, timeZone);
    if (entry.allDay || options.granularity === "day") return date;
    const endMs = newStartMs + (entry.durationMs ?? DEFAULT_DURATION_MS);
    return `${date} ${formatZonedTime(newStartMs, timeZone)} – ${formatZonedTime(endMs, timeZone)}`;
}

/**
 * The destination of a resize drag: `09:00 – 10:30 (1h30m)` in the time
 * grid, `Mon, Aug 3 – Thu, Aug 6 (3 days)` at day granularity (Gantt).
 * Empty when the entry has no start to resize from.
 */
export function formatDragResizeLabel(
    entry: CalendarEntry,
    newDurationMs: number,
    timeZone: string,
    options: DragLabelOptions = {},
): string {
    const startMs = options.startMs ?? entry.startMs;
    if (startMs === undefined) return "";
    const endMs = startMs + newDurationMs;
    if (options.granularity === "day") {
        const span = `${formatZonedDate(startMs, timeZone)} – ${formatZonedDate(endMs, timeZone)}`;
        return `${span} (${formatDayCount(newDurationMs)})`;
    }
    const span = `${formatZonedTime(startMs, timeZone)} – ${formatZonedTime(endMs, timeZone)}`;
    return `${span} (${formatDuration(newDurationMs)})`;
}

/** A Gantt roll-up drag: how far the whole subtree shifts, and where it lands. */
export function formatSubtreeShiftLabel(deltaMs: number, newStartMs: number, timeZone: string): string {
    return `${formatShiftDays(deltaMs)} → ${formatZonedDate(newStartMs, timeZone)}`;
}
