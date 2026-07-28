// Deleting a calendar entry (#4349): never silently destructive. There are
// three possible outcomes, and the caller (the delete-disposition dialog)
// always chooses which one applies:
//
//   - "delete-source"          remove the item entirely.
//   - "clear-projected-field"  keep the item, clear the field that put it on
//                              the calendar, so it leaves without being lost.
//   - "delete one occurrence"  only offered when the entry is itself a
//                              materialized recurrence override
//                              (`recurrenceParentId`/`recurrenceOccurrenceId`,
//                              from `recurrenceEditing.ts`'s
//                              `createRecurrenceOverride`): records an
//                              exception on the *source* recurring item and
//                              removes the override, leaving the rule and
//                              every other occurrence untouched (#4343).
//
// The first two go through the ordinary relation write path
// (`applyUnionedRowDelete`, which resolves `entry.sourceKind` and lets the
// relation's own `applyWrite`/`assertWriteAllowed` decide) — the same path
// drag/resize already uses, so nothing here bypasses the capability
// declaration. The third operates directly on Yjs, the same way
// `recurrenceEditing.ts` already does: a virtual/overridden occurrence has no
// PGlite row of its own to address by a generic relation write.

import type { Project } from "$shared/app-schema";
import { Item } from "$shared/app-schema";
import type { RelationDeleteDisposition } from "../yjstable/relationProvider";
import { ORDERED_TREE_KEY } from "../yjstable/itemsRelation";
import type { RelationResolver } from "../yjstable/relationRowWrite";
import { applyUnionedRowDelete } from "../yjstable/relationRowWrite";
import type { CalendarEntry } from "./calendarEntries";
import { deleteOccurrence } from "./recurrenceEditing";

/** Whether `entry` is a materialized override of one recurring occurrence. */
export function isRecurrenceOverrideEntry(
    entry: Pick<CalendarEntry, "recurrenceParentId" | "recurrenceOccurrenceId">,
): boolean {
    return Boolean(entry.recurrenceParentId && entry.recurrenceOccurrenceId);
}

function requireOrigin(entry: Pick<CalendarEntry, "sourceKind" | "sourceId">): {
    sourceKind: string;
    sourceId: string;
} {
    if (!entry.sourceKind || !entry.sourceId) {
        throw new Error("Entry has no writable origin (missing source_kind/source_id)");
    }
    return { sourceKind: entry.sourceKind, sourceId: entry.sourceId };
}

/** Delete `entry` through its relation, choosing between the two ordinary dispositions. */
export async function deleteCalendarEntry(
    resolver: RelationResolver,
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId">,
    disposition: RelationDeleteDisposition,
): Promise<void> {
    const { sourceKind, sourceId } = requireOrigin(entry);
    await applyUnionedRowDelete(resolver, sourceKind, sourceId, disposition);
}

function findItemById(project: Project, id: string): Item | undefined {
    const treeMap = project.ydoc.getMap(ORDERED_TREE_KEY);
    for (const key of treeMap.keys()) {
        if (key === "root") continue;
        const item = new Item(project.ydoc, project.tree, key);
        if (item.id === id) return item;
    }
    return undefined;
}

/**
 * Delete one occurrence of a recurring plan: records an exception on the
 * source recurring item and removes `entry`'s own override, leaving the rule
 * and its other occurrences alone. Only valid when `isRecurrenceOverrideEntry`
 * is true for `entry`.
 */
export function deleteCalendarRecurrenceOccurrence(
    project: Project,
    entry: Pick<CalendarEntry, "sourceId" | "recurrenceParentId" | "recurrenceOccurrenceId">,
): void {
    if (!entry.sourceId || !entry.recurrenceParentId || !entry.recurrenceOccurrenceId) {
        throw new Error("Entry is not a materialized recurrence override");
    }
    const source = findItemById(project, entry.recurrenceParentId);
    if (!source) {
        throw new Error(`Recurring item "${entry.recurrenceParentId}" no longer exists`);
    }
    const override = new Item(project.ydoc, project.tree, entry.sourceId);
    project.ydoc.transact(() => {
        deleteOccurrence(project.tree, source, entry.recurrenceOccurrenceId!, override);
    });
}
