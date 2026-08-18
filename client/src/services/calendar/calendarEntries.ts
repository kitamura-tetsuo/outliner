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

import { floatingDateToUtcMs } from "$shared/utils/zonedTime";
import { Item, Items } from "../../schema/app-schema";
import type { Project } from "../../schema/app-schema";
import { expandItemOccurrencesWithOverrides } from "../yjstable/recurrenceExpansion";
import type { CalendarSettings } from "./calendarService";
import { isOutlineItemSourceKind } from "./calendarSourceIdentity";
import { parsePgIntervalMs } from "./pgInterval";

export interface CalendarEntry {
    /** Stable identity across a requery: `source_kind:source_id`, or the row index as a last resort. */
    key: string;
    sourceKind?: string;
    sourceId?: string;
    /**
     * The outline parent of this row's item, when the query's SELECT carries
     * a `parent_id` column (Gantt's hierarchy, #4350 — `outline_items`
     * already carries it, so nesting means exactly what it means in the
     * outline). Only ever set for items-relation rows; a table-derived row
     * has no `parent_id` and so never nests.
     */
    parentId?: string;
    title: string;
    /** True for a floating-date entry, false for an instant, undefined when the row has no start at all. */
    allDay?: boolean;
    /**
     * Epoch ms: for an all-day entry, the instant the calendar's timezone
     * reaches midnight of its floating date; for a timed one, the instant
     * itself. Both are therefore directly comparable with the grid range
     * (calendarGridRange.ts), which is computed in that same timezone.
     */
    startMs?: number;
    /** Epoch ms length, when present. */
    durationMs?: number;
    /** Epoch ms deadline, when the row carries a due role value. */
    dueMs?: number;
    /**
     * `Item.id` of the recurring item this row overrides, when the row is a
     * materialized recurrence override (`recurrenceEditing.ts`'s
     * `createRecurrenceOverride`) — structural, like `sourceKind`/`sourceId`,
     * so it is read whenever the query's SELECT carries the column
     * regardless of role assignment. Deleting such a row means deleting one
     * occurrence of a plan, not the plan itself (see `calendarEntryDelete.ts`).
     */
    recurrenceParentId?: string;
    /** The occurrence this override replaces, paired with `recurrenceParentId`. */
    recurrenceOccurrenceId?: string;
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

/**
 * Parse a role's start value: a floating `YYYY-MM-DD` for all-day (resolved
 * against `timeZone`, see `floatingDateToUtcMs`), an ISO instant otherwise.
 */
function parseStartMs(raw: string, allDay: boolean, timeZone: string): number | undefined {
    if (allDay) return floatingDateToUtcMs(raw, timeZone);
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? undefined : ms;
}

/**
 * A `due` value is a deadline that may be written either way round: `due`
 * projects whatever the item stored, so a bare date is floating (and belongs
 * to the view's zone, like any all-day value) while a full timestamp is
 * already an instant.
 */
function parseDueMs(raw: string, timeZone: string): number | undefined {
    const floating = floatingDateToUtcMs(raw, timeZone);
    if (floating !== undefined) return floating;
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? undefined : ms;
}

export function buildCalendarEntries(
    result: { columns: string[]; rows: Record<string, unknown>[]; },
    settings: Pick<CalendarSettings, "roleTitle" | "roleStart" | "roleAllDay" | "roleDuration" | "roleDue">,
    timeZone: string,
    project?: Project,
    queryRange?: { startUtcMs: number; endUtcMs: number; },
): CalendarEntry[] {
    const entries: CalendarEntry[] = [];

    result.rows.forEach((row, index) => {
        const sourceKind = toStringValue(row["source_kind"]);
        const sourceId = toStringValue(row["source_id"]);
        const idFallback = toStringValue(row["id"]);
        const key = sourceKind && sourceId ? `${sourceKind}:${sourceId}` : idFallback ?? `row:${index}`;
        const parentId = toStringValue(row["parent_id"]);

        const title = settings.roleTitle ? toStringValue(row[settings.roleTitle]) ?? "" : "";

        const allDayRaw = settings.roleAllDay ? toBooleanValue(row[settings.roleAllDay]) : undefined;
        const startRaw = settings.roleStart ? toStringValue(row[settings.roleStart]) : undefined;
        const allDay = startRaw !== undefined ? (allDayRaw ?? false) : undefined;
        const startMs = startRaw !== undefined ? parseStartMs(startRaw, allDay === true, timeZone) : undefined;

        const durationRaw = settings.roleDuration ? row[settings.roleDuration] : undefined;
        const durationMs = typeof durationRaw === "string"
            ? parsePgIntervalMs(durationRaw)
            : undefined;

        const dueRaw = settings.roleDue ? toStringValue(row[settings.roleDue]) : undefined;
        const dueMs = dueRaw !== undefined ? parseDueMs(dueRaw, timeZone) : undefined;

        const recurrenceParentId = toStringValue(row["recurrence_parent_id"]);
        const recurrenceOccurrenceId = toStringValue(row["recurrence_occurrence_id"]);

        const rrule = toStringValue(row["rrule"]);

        // Any of the source-kind literals that name the outline-items
        // relation, not just the bare `items` this first checked: the
        // reserved name is `outline_items` and shipped queries also alias it
        // to `item`, so keying expansion on one spelling silently left a
        // recurring row as a single anchor bar in exactly the queries the
        // demo and the docs use (see calendarSourceIdentity.ts).
        if (rrule && isOutlineItemSourceKind(sourceKind) && sourceId && project && queryRange) {
            try {
                const item = new Item(project.ydoc, project.tree, sourceId);
                const parentKey = project.tree.getNodeParentFromKey(sourceId);
                if (parentKey) {
                    const siblings = new Items(project.ydoc, project.tree, parentKey);
                    const occurrences = expandItemOccurrencesWithOverrides(
                        item,
                        siblings,
                        queryRange.startUtcMs,
                        queryRange.endUtcMs,
                    );

                    for (const occ of occurrences) {
                        entries.push({
                            key: `${sourceKind}:${sourceId}:${occ.occurrenceId}`,
                            sourceKind,
                            sourceId,
                            parentId,
                            title,
                            allDay,
                            startMs: occ.startUtcMs,
                            durationMs: occ.endUtcMs - occ.startUtcMs,
                            dueMs,
                            recurrenceParentId,
                            recurrenceOccurrenceId,
                            raw: {
                                ...row,
                                start_at: new Date(occ.startUtcMs).toISOString(),
                                duration: `${occ.endUtcMs - occ.startUtcMs} ms`,
                            },
                        });
                    }
                    return; // Returning from the forEach callback, effectively acts as a continue for the loop
                }
            } catch (_e) {
                // Fallback to normal push if item resolution fails
            }
        }

        entries.push({
            key,
            sourceKind,
            sourceId,
            parentId,
            title,
            allDay,
            startMs,
            durationMs,
            dueMs,
            recurrenceParentId,
            recurrenceOccurrenceId,
            raw: row,
        });
    });

    return entries;
}
