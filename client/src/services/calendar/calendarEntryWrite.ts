// Write dispatch for a calendar entry's drag/resize/keyboard move (#4347).
//
// Every edit goes through the relation's own write path — never PGlite
// directly (docs/crdt-sql-architecture.md §4) — addressed by the entry's
// `source_kind`/`source_id` (relationRowWrite.ts's `applyUnionedRowEdit`),
// exactly like a table's unioned-row edit.
//
// The write's *target column* is the underlying column
// `calendarColumnWritability.ts` resolved for the role — never the
// calendar query's own output alias, which may not exist on the source
// relation at all. This is also why a drag/resize never has to reconcile
// `start_on` vs. `start_at` itself: whichever one the query's `roleStart`
// column actually passes through is the one written, and `entry.allDay`
// (derived from that same resolved shape when the row was built) decides
// only how the value is formatted, not which column receives it.

import type { RelationResolver } from "../yjstable/relationRowWrite";
import { applyUnionedRowEdit } from "../yjstable/relationRowWrite";
import type { CalendarEntry } from "./calendarEntries";
import { msToIsoDuration } from "./pgInterval";

export interface CalendarEntryWritability {
    /** True when this entry may be dragged (its start column has a writable origin). */
    startWritable: boolean;
    /** True when this entry may be resized (its duration column has a writable origin). */
    durationWritable: boolean;
}

/**
 * Whether `entry`'s start/duration may be written, given the query's
 * resolved writable columns (`analyzeCalendarColumnWritability`) and the
 * calendar's role assignment. An entry with no `source_kind`/`source_id` can
 * never be addressed for a write regardless of column writability.
 */
export function resolveCalendarEntryWritability(
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId">,
    roles: { roleStart?: string; roleDuration?: string; },
    writableColumns: Map<string, string>,
): CalendarEntryWritability {
    const addressable = Boolean(entry.sourceKind && entry.sourceId);
    return {
        startWritable: addressable && Boolean(roles.roleStart) && writableColumns.has(roles.roleStart!),
        durationWritable: addressable && Boolean(roles.roleDuration) && writableColumns.has(roles.roleDuration!),
    };
}

function requireOrigin(
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId">,
): { sourceKind: string; sourceId: string; } {
    if (!entry.sourceKind || !entry.sourceId) {
        throw new Error("Entry has no writable origin (missing source_kind/source_id)");
    }
    return { sourceKind: entry.sourceKind, sourceId: entry.sourceId };
}

/**
 * Write a new start instant for `entry` through the relation named by
 * `writableStartColumn` (the resolved underlying column for the calendar's
 * `roleStart`, from `analyzeCalendarColumnWritability`).
 */
export async function writeCalendarEntryStart(
    resolver: RelationResolver,
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId" | "allDay">,
    writableStartColumn: string,
    newStartMs: number,
): Promise<void> {
    const { sourceKind, sourceId } = requireOrigin(entry);
    const value = entry.allDay
        ? new Date(newStartMs).toISOString().slice(0, 10)
        : new Date(newStartMs).toISOString();
    await applyUnionedRowEdit(resolver, sourceKind, sourceId, writableStartColumn, value);
}

/** Write a new duration for `entry`, as the ISO 8601 text `Item.duration` stores. */
export async function writeCalendarEntryDuration(
    resolver: RelationResolver,
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId">,
    writableDurationColumn: string,
    newDurationMs: number,
): Promise<void> {
    const { sourceKind, sourceId } = requireOrigin(entry);
    await applyUnionedRowEdit(resolver, sourceKind, sourceId, writableDurationColumn, msToIsoDuration(newDurationMs));
}
