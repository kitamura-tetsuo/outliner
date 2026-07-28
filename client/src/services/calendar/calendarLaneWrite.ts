// Write dispatch for dropping a calendar entry onto a grouping lane (#4348).
//
// A drop writes the grouping column through the relation's own write path —
// never PGlite directly (docs/crdt-sql-architecture.md §4) — exactly like a
// drag/resize in the time-grid views (calendarEntryWrite.ts). The column
// written is the *underlying* one `calendarColumnWritability.ts` resolved for
// the axis, never the calendar query's own output alias.
//
// Two drop modes, matching the repo's `Ctrl`/`Cmd` pairing (docs/index.md):
//   - Plain drop ("replace"): the item's value for this axis becomes exactly
//     the target lane's value. For a multi-valued (tags-like) axis this
//     discards every other value the row carried — a destructive default,
//     acceptable only because "add" is the discoverable alternative.
//   - `Ctrl`/`Cmd` drop ("add"): adds the lane's value to the existing set
//     without disturbing the rest of it. Only meaningful for a multi-valued
//     axis; `UPDATE_APPEND` is what makes it merge-safe against a concurrent
//     add from another client (relationProvider.ts), rather than reading the
//     set back and racing a full replace.
// `Shift` is not assigned and behaves as the default (plain replace).

import type { RelationResolver } from "../yjstable/relationRowWrite";
import { applyUnionedRowAppend, applyUnionedRowEdit } from "../yjstable/relationRowWrite";
import type { CalendarEntry } from "./calendarEntries";
import { isMultiValuedAxis } from "./calendarGrouping";

export type LaneDropMode = "replace" | "add";

function requireOrigin(
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId">,
): { sourceKind: string; sourceId: string; } {
    if (!entry.sourceKind || !entry.sourceId) {
        throw new Error("Entry has no writable origin (missing source_kind/source_id)");
    }
    return { sourceKind: entry.sourceKind, sourceId: entry.sourceId };
}

/**
 * Whether `entry` may be dropped onto a lane of `groupAxis`: the axis must
 * resolve to a writable underlying column (`analyzeCalendarColumnWritability`)
 * and the entry must be addressable by `source_kind`/`source_id`. A lane
 * backed by a non-writable column (`source_kind`, a `CASE WHEN` expression)
 * must read as a non-target rather than accepting a drop that then snaps back.
 */
export function isLaneDropWritable(
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId">,
    groupAxis: string | undefined,
    writableColumns: Map<string, string>,
): boolean {
    return Boolean(entry.sourceKind && entry.sourceId && groupAxis && writableColumns.has(groupAxis));
}

/**
 * Drop `entry` onto a lane whose value is `laneValue` (undefined for the
 * NULL/empty lane). `groupAxis` is the calendar's result column (used to read
 * the entry's current raw shape); `writableColumn` is the underlying column
 * `analyzeCalendarColumnWritability` resolved for it, and is what the write
 * actually addresses.
 */
export async function writeCalendarLaneDrop(
    resolver: RelationResolver,
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId" | "raw">,
    groupAxis: string,
    writableColumn: string,
    laneValue: string | undefined,
    mode: LaneDropMode,
): Promise<void> {
    const { sourceKind, sourceId } = requireOrigin(entry);
    const multiValued = isMultiValuedAxis(entry, groupAxis);

    if (mode === "add") {
        if (!multiValued) {
            throw new Error(`Column "${writableColumn}" is not multi-valued; "add" only applies to a tags-like axis`);
        }
        if (laneValue === undefined) return; // Nothing to add to the NULL/empty lane.
        await applyUnionedRowAppend(resolver, sourceKind, sourceId, writableColumn, laneValue);
        return;
    }

    const value = multiValued ? JSON.stringify(laneValue === undefined ? [] : [laneValue]) : laneValue ?? null;
    await applyUnionedRowEdit(resolver, sourceKind, sourceId, writableColumn, value);
}
