// Write dispatch specific to the Gantt view (#4350).
//
// A leaf bar's drag/resize is identical to the time-grid views' own write
// path — same relation write, same writability rule (calendarEntryWrite.ts)
// — "the difference is axis orientation and hierarchy, not the write path"
// (issue #4350's own implementation note). Callers use
// `resolveCalendarEntryWritability`/`writeCalendarEntryStart`/
// `writeCalendarEntryDuration` from calendarEntryWrite.ts directly for that
// case; nothing here duplicates it.
//
// A parent's rolled-up bar is the one write Gantt adds: it has no start
// column of its own (its span is *derived* from its subtree), so dragging it
// shifts every descendant's own `start`, preserving each one's relative
// offset. That is several item field writes that must land as **one** undo
// entry, not one per child.
//
// Those writes deliberately do NOT go through `itemsRelation.ts`'s
// `applyWrite`: each call there wraps its own single write in its own
// `Y.Doc.transact(..., ITEMS_RELATION_ORIGIN)` — a distinct transaction per
// row, tagged with an origin the outline's `Y.UndoManager` does not track
// (`trackedOrigins: [null]`, store.svelte.ts), the same as every other
// relation-routed item write. A batch of N such calls would not merge into
// one undo entry (nor, today, into any undo entry at all). Writing directly
// to each descendant's `Item.start` inside a single `project.ydoc.transact`
// call (default origin) is what the outline's undo manager *does* track —
// the same mechanism recurrenceEditing.ts already uses for its own
// direct-Yjs, non-relation item writes, for the same reason: a batch of
// field writes that must behave as one operation.

import type { Project } from "$shared/app-schema";
import { Item } from "$shared/app-schema";
import { utcMsToFloatingDate } from "$shared/utils/zonedTime";
import type { CalendarEntry } from "./calendarEntries";
import { resolveCalendarEntryWritability } from "./calendarEntryWrite";
import type { GanttRow } from "./calendarGanttLayout";

/** Mirrors `ItemsRelationProvider`'s own defensive check (itemsRelation.ts): `YTree.hasNode` is not always present. */
function hasNode(project: Project, key: string): boolean {
    const tree = project.tree as { hasNode?: (k: string) => boolean; computedMap?: { has(k: string): boolean; }; };
    if (typeof tree.hasNode === "function") return tree.hasNode(key);
    return tree.computedMap?.has(key) ?? project.ydoc.getMap("orderedTree").has(key);
}

export interface GanttSubtreeMember {
    key: string;
    allDay: boolean;
    startMs: number;
}

export interface GanttSubtreeShiftAnalysis {
    /** True only when every start-bearing member of the subtree is addressable and writable. */
    shiftable: boolean;
    /** Every subtree member (the root row itself, plus every descendant) that actually carries a `start` to move. */
    members: GanttSubtreeMember[];
}

/**
 * Whether `row`'s whole subtree may be dragged as a unit, and which members
 * would actually move. A descendant with no `start` of its own (a due-only
 * marker, or a purely structural node) contributes nothing to shift and its
 * writability is irrelevant — only start-bearing members matter, and
 * *every* one of them must be addressable (`source_kind`/`source_id`) and
 * resolve to a writable column, or the whole subtree reads as undraggable
 * rather than moving partially (#4350's own acceptance criteria).
 */
export function analyzeGanttSubtreeShift(
    row: GanttRow,
    entryByKey: ReadonlyMap<string, CalendarEntry>,
    roles: { roleStart?: string; },
    writableColumns: Map<string, string>,
): GanttSubtreeShiftAnalysis {
    const members: GanttSubtreeMember[] = [];
    let shiftable = true;

    for (const key of [row.key, ...row.descendantKeys]) {
        const entry = entryByKey.get(key);
        if (!entry || entry.startMs === undefined) continue;
        const writability = resolveCalendarEntryWritability(entry, roles, writableColumns);
        if (!writability.startWritable) {
            shiftable = false;
            continue;
        }
        members.push({ key, allDay: entry.allDay === true, startMs: entry.startMs });
    }

    return { shiftable, members };
}

/**
 * Shift every member's `start` by `deltaMs`, in one Yjs transaction (default
 * origin) so the outline's `Y.UndoManager` records the whole subtree move as
 * a single stack item. A member whose item was concurrently deleted is
 * skipped rather than throwing — the same "the query result is
 * authoritative" posture the optimistic-placement model already takes for a
 * single entry (calendarOptimisticPlacement.ts).
 */
export function applyGanttSubtreeShift(
    project: Project,
    members: GanttSubtreeMember[],
    deltaMs: number,
    timeZone: string,
): void {
    if (members.length === 0 || deltaMs === 0) return;
    project.ydoc.transact(() => {
        for (const member of members) {
            if (!hasNode(project, member.key)) continue;
            const item = new Item(project.ydoc, project.tree, member.key);
            const newStartMs = member.startMs + deltaMs;
            // An all-day member's floating date is derived in the calendar's
            // own timezone, matching how `buildCalendarEntries` read it — see
            // `writeCalendarEntryStart`, whose single-entry write this is the
            // subtree equivalent of.
            item.start = member.allDay
                ? utcMsToFloatingDate(newStartMs, timeZone)
                : new Date(newStartMs).toISOString();
        }
    });
}
