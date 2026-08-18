// Human-readable scheduling details for an outline item's calendar indicator
// (#4981).
//
// Every line is rendered in the *owning calendar's* timezone, reusing the
// same `formatZonedDate`/`formatZonedTime`/`formatDuration` helpers the drag
// tooltip uses (calendarDragLabel.ts), so an item scheduled on a calendar
// pinned to `Asia/Tokyo` reads the same for a viewer in Berlin as it does for
// one in Tokyo. All-day entries are dates, never midnight instants.

import { floatingDateToUtcMs, utcMsToFloatingDate } from "$shared/utils/zonedTime";
import { formatDuration, formatZonedDate, formatZonedTime } from "./calendarDragLabel";
import type { CalendarMembership, ScheduleOccurrence } from "./calendarScheduleIndex.svelte";

const DAY_MS = 86_400_000;

/**
 * The last day an all-day entry covers, as an instant inside that day in
 * `timeZone`.
 *
 * An all-day span is a count of *calendar* days, so it is advanced in
 * wall-clock days rather than by adding its millisecond duration: a two-day
 * entry starting the night the clocks go forward is only 47 elapsed hours, and
 * `start + duration` would name the day after the one it actually ends on.
 */
function allDayEndInstantMs(startMs: number, durationMs: number, timeZone: string): number | undefined {
    const days = Math.max(1, Math.round(durationMs / DAY_MS));
    if (days === 1) return undefined;
    const startDate = utcMsToFloatingDate(startMs, timeZone);
    const [year, month, day] = startDate.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month - 1, day + days - 1));
    return floatingDateToUtcMs(utcMsToFloatingDate(lastDay.getTime(), "UTC"), timeZone);
}

/** `Mon, Aug 3 09:15 – 09:45 (30m)`, `Mon, Aug 3 (all day)`, `due Mon, Aug 3 17:00`. */
export function formatOccurrenceTiming(occurrence: ScheduleOccurrence, timeZone: string): string {
    const parts: string[] = [];

    if (occurrence.startMs !== undefined) {
        const date = formatZonedDate(occurrence.startMs, timeZone);
        if (occurrence.allDay) {
            const endMs = occurrence.durationMs !== undefined
                ? allDayEndInstantMs(occurrence.startMs, occurrence.durationMs, timeZone)
                : undefined;
            const endDate = endMs !== undefined ? formatZonedDate(endMs, timeZone) : undefined;
            parts.push(
                endDate && endDate !== date ? `${date} – ${endDate} (all day)` : `${date} (all day)`,
            );
        } else if (occurrence.durationMs !== undefined) {
            const endMs = occurrence.startMs + occurrence.durationMs;
            parts.push(
                `${date} ${formatZonedTime(occurrence.startMs, timeZone)} – ${formatZonedTime(endMs, timeZone)} (${
                    formatDuration(occurrence.durationMs)
                })`,
            );
        } else {
            parts.push(`${date} ${formatZonedTime(occurrence.startMs, timeZone)}`);
        }
    }

    if (occurrence.dueMs !== undefined) {
        const dueDate = formatZonedDate(occurrence.dueMs, timeZone);
        parts.push(`due ${dueDate} ${formatZonedTime(occurrence.dueMs, timeZone)}`);
    }

    if (parts.length === 0) return "no date";
    return parts.join(", ");
}

/** One line per occurrence: `Work: Mon, Aug 3 09:15 – 09:45 (30m) (Asia/Tokyo)`. */
export function formatMembershipLines(membership: CalendarMembership): string[] {
    const name = membership.calendarName || "Untitled calendar";
    const lines = membership.occurrences.map((occurrence) =>
        `${name}: ${formatOccurrenceTiming(occurrence, membership.timeZone)} (${membership.timeZone})`
    );
    if (membership.occurrences.length === 0) {
        lines.push(`${name}: no date (${membership.timeZone})`);
    }
    if (membership.hiddenOccurrenceCount > 0) {
        lines.push(
            `${name}: +${membership.hiddenOccurrenceCount} more occurrence${
                membership.hiddenOccurrenceCount === 1 ? "" : "s"
            }`,
        );
    }
    return lines;
}

/** Every membership's lines, in index order — no calendar is ever collapsed away. */
export function formatScheduleDetailLines(memberships: CalendarMembership[]): string[] {
    return memberships.flatMap((membership) => formatMembershipLines(membership));
}

/**
 * The indicator's accessible name: the whole detail, flattened, so the
 * information is available to a screen reader and on keyboard focus rather
 * than to a hovering pointer only.
 */
export function formatScheduleSummary(memberships: CalendarMembership[]): string {
    if (memberships.length === 0) return "Not scheduled on any calendar";
    const lines = formatScheduleDetailLines(memberships);
    const heading = memberships.length === 1
        ? "Scheduled on 1 calendar"
        : `Scheduled on ${memberships.length} calendars`;
    return `${heading}. ${lines.join(". ")}`;
}
