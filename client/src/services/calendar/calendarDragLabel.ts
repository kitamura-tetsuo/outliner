import type { CalendarEntry } from "./calendarEntries";
import { formatWallTime, utcMsToWallTime } from "$shared/utils/zonedTime";

function pad(n: number): string {
    return String(Math.trunc(n)).padStart(2, "0");
}

function formatDateOnly(utcMs: number, timeZone: string): string {
    const w = utcMsToWallTime(utcMs, timeZone);
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day));
    const formatted = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    }).format(d);
    return formatted;
}

function formatTimeOnly(utcMs: number, timeZone: string): string {
    const w = utcMsToWallTime(utcMs, timeZone);
    return `${pad(w.hour)}:${pad(w.minute)}`;
}

function formatDateTime(utcMs: number, timeZone: string): string {
    const w = utcMsToWallTime(utcMs, timeZone);
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day));
    const dateStr = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
    }).format(d);

    return `${dateStr} ${w.month}/${w.day} ${pad(w.hour)}:${pad(w.minute)}`;
}

function formatDuration(durationMs: number): string {
    const days = Math.floor(durationMs / 86_400_000);
    const msInDay = durationMs % 86_400_000;
    const hours = Math.floor(msInDay / 3_600_000);
    const msInHour = msInDay % 3_600_000;
    const minutes = Math.round(msInHour / 60_000);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join("") || "0m";
}

export function formatDragMoveLabel(entry: CalendarEntry, newStartMs: number, timeZone: string): string {
    if (entry.allDay) {
        return formatDateOnly(newStartMs, timeZone);
    }

    const startStr = formatDateTime(newStartMs, timeZone);
    if (entry.durationMs === undefined) {
        return startStr;
    }

    const newEndMs = newStartMs + entry.durationMs;
    const startWall = utcMsToWallTime(newStartMs, timeZone);
    const endWall = utcMsToWallTime(newEndMs, timeZone);

    if (startWall.year === endWall.year && startWall.month === endWall.month && startWall.day === endWall.day) {
        return `${startStr} – ${formatTimeOnly(newEndMs, timeZone)}`;
    } else {
        return `${startStr} – ${formatDateTime(newEndMs, timeZone)}`;
    }
}

export function formatDragResizeLabel(entry: CalendarEntry, newDurationMs: number, timeZone: string): string {
    const startMs = entry.startMs ?? 0;
    const endMs = startMs + newDurationMs;

    if (entry.allDay) {
        const startStr = formatDateOnly(startMs, timeZone);
        const endStr = formatDateOnly(endMs, timeZone);
        const days = Math.round(newDurationMs / 86_400_000);
        return `${startStr} – ${endStr} (${days}d)`;
    } else {
        const startWall = utcMsToWallTime(startMs, timeZone);
        const endWall = utcMsToWallTime(endMs, timeZone);

        const startStr = formatTimeOnly(startMs, timeZone);
        let endStr = formatTimeOnly(endMs, timeZone);
        if (startWall.year !== endWall.year || startWall.month !== endWall.month || startWall.day !== endWall.day) {
            endStr = formatDateTime(endMs, timeZone);
        }

        return `${startStr} – ${endStr} (${formatDuration(newDurationMs)})`;
    }
}

export function formatSubtreeShiftLabel(deltaMs: number, newStartMs: number, timeZone: string): string {
    const sign = deltaMs >= 0 ? "+" : "-";
    const absDelta = Math.abs(deltaMs);
    const days = Math.round(absDelta / 86_400_000);
    const shiftStr = `${sign}${days} day${days === 1 ? "" : "s"}`;

    const startStr = formatDateOnly(newStartMs, timeZone);
    return `${shiftStr} (${startStr})`;
}
