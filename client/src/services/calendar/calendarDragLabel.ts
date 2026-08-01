import type { CalendarEntry } from "$shared/types/yjs-types";
import { formatZonedTime, formatZonedDate } from "$shared/utils/zonedTime";

function formatDuration(durationMs: number): string {
    const minutes = Math.round(durationMs / 60000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
}

function formatShiftDays(deltaMs: number): string {
    const days = Math.round(deltaMs / 86400000);
    if (days > 0) return `+${days} day${days === 1 ? "" : "s"}`;
    if (days < 0) return `${days} day${days === -1 ? "" : "s"}`;
    return "0 days";
}

export function formatDragMoveLabel(entry: CalendarEntry, newStartMs: number, timeZone: string): string {
    if (entry.allDay) {
        return formatZonedDate(newStartMs, timeZone);
    }
    const endMs = newStartMs + (entry.endMs !== undefined && entry.startMs !== undefined ? entry.endMs - entry.startMs : 1800000);
    const startStr = formatZonedDate(newStartMs, timeZone) + " " + formatZonedTime(newStartMs, timeZone);
    const endStr = formatZonedTime(endMs, timeZone);
    return `${startStr} \u2013 ${endStr}`;
}

export function formatDragResizeLabel(entry: CalendarEntry, newDurationMs: number, timeZone: string): string {
    if (entry.startMs === undefined) return "";
    const startStr = formatZonedTime(entry.startMs, timeZone);
    const endStr = formatZonedTime(entry.startMs + newDurationMs, timeZone);
    return `${startStr} \u2013 ${endStr} (${formatDuration(newDurationMs)})`;
}

export function formatSubtreeShiftLabel(deltaMs: number, newStartMs: number, timeZone: string): string {
    return `${formatShiftDays(deltaMs)} \u2192 ${formatZonedDate(newStartMs, timeZone)}`;
}
