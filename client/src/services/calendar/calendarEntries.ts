// Turns a calendar's raw query result (arbitrary column names, per the role
// assignment of #4344) into typed `CalendarEntry` objects the grid views lay
// out and drag.
//
// The *shape* of an entry (all-day / timed / due-only marker) is decided
// entirely by which values are actually present on the row, not by asking
// the grid to branch on `source_kind` (§3: never a layout property of where a
// row came from). `roleAllDay` only picks which band the entry is *drawn*
// in; the writable *start* column (all-day vs timed) is resolved separately,
// from the query text, by calendarColumnWritability.ts — see
// calendarEntryWrite.ts for why those two must not be conflated.

import type { CalendarSettings } from "./calendarService";
import { parsePgIntervalMs } from "./pgInterval";

export interface CalendarEntry {
    /** Stable identity across a requery: `source_kind:source_id`, or the row index as a last resort. */
    key: string;
    sourceKind?: string;
    sourceId?: string;
    title: string;
    /** True for a floating-date entry, false for an instant, undefined when the row has no start at all. */
    allDay?: boolean;
    /** Epoch ms: UTC midnight of the date for an all-day entry, the instant for a timed one. */
    startMs?: number;
    /** Epoch ms length, when present. */
    durationMs?: number;
    /** Epoch ms deadline, when the row carries a due role value. */
    dueMs?: number;
    /** The raw row, for anything a caller needs beyond the typed fields above. */
    raw: Record<string, unknown>;
}

function toStringValue(v: unknown): string | undefined {
    if (v === null || v === undefined) return undefined;
    return String(v);
}

function toBooleanValue(v: unknown): boolean | undefined {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return v === "t" || v === "true" || v === "1";
    return Boolean(v);
}

/** Parse a role's start value: `YYYY-MM-DD` for all-day, an ISO instant otherwise. */
function parseStartMs(raw: string, allDay: boolean): number | undefined {
    const ms = allDay ? Date.parse(`${raw}T00:00:00Z`) : Date.parse(raw);
    return Number.isNaN(ms) ? undefined : ms;
}

export function buildCalendarEntries(
    result: { columns: string[]; rows: Record<string, unknown>[]; },
    settings: Pick<CalendarSettings, "roleTitle" | "roleStart" | "roleAllDay" | "roleDuration" | "roleDue">,
): CalendarEntry[] {
    const entries: CalendarEntry[] = [];

    result.rows.forEach((row, index) => {
        const sourceKind = toStringValue(row["source_kind"]);
        const sourceId = toStringValue(row["source_id"]);
        const idFallback = toStringValue(row["id"]);
        const key = sourceKind && sourceId ? `${sourceKind}:${sourceId}` : idFallback ?? `row:${index}`;

        const title = settings.roleTitle ? toStringValue(row[settings.roleTitle]) ?? "" : "";

        const allDayRaw = settings.roleAllDay ? toBooleanValue(row[settings.roleAllDay]) : undefined;
        const startRaw = settings.roleStart ? toStringValue(row[settings.roleStart]) : undefined;
        const allDay = startRaw !== undefined ? (allDayRaw ?? false) : undefined;
        const startMs = startRaw !== undefined ? parseStartMs(startRaw, allDay === true) : undefined;

        const durationRaw = settings.roleDuration ? row[settings.roleDuration] : undefined;
        const durationMs = typeof durationRaw === "string"
            ? parsePgIntervalMs(durationRaw)
            : undefined;

        const dueRaw = settings.roleDue ? toStringValue(row[settings.roleDue]) : undefined;
        const dueParsed = dueRaw !== undefined ? Date.parse(dueRaw) : NaN;
        const dueMs = Number.isNaN(dueParsed) ? undefined : dueParsed;

        entries.push({
            key,
            sourceKind,
            sourceId,
            title,
            allDay,
            startMs,
            durationMs,
            dueMs,
            raw: row,
        });
    });

    return entries;
}
