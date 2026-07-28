// The three ways a recurring item's occurrence gets edited (§6.2):
//
//   - "this occurrence"          -> createRecurrenceOverride: a virtual
//     occurrence becomes an ordinary item the moment it is edited.
//   - "this occurrence, deleted" -> deleteOccurrence: records an exception,
//     never removes the rule.
//   - "this and following"       -> splitRecurrenceAtOccurrence: truncates
//     the original rule and starts a new item from the split point.
//   - "all events" needs no function here: it is an ordinary edit of the
//     recurring item's own fields (`rrule`, `text`, `duration`, ...).
//
// Every function here operates directly on Yjs; none of it goes through
// `itemsRelation.ts`'s `applyWrite`, because a virtual occurrence has no
// PGlite row to address in the first place (see `recurrenceExpansion.ts`).

import { Item, Items } from "$shared/app-schema";
import { parseWallTime, wallTimeToFloatingDate } from "$shared/utils/zonedTime";
import { RRule, rrulestr } from "rrule";
import type { YTree } from "yjs-orderedtree";

export interface OverrideEdits {
    text?: string;
    duration?: string;
}

/**
 * Creates the override for one occurrence: a new sibling item carrying
 * `recurrenceParentId`/`recurrenceOccurrenceId`, seeded from `source` and
 * the occurrence's own time so an unedited override still renders where the
 * virtual occurrence was. From here it is an ordinary item — draggable,
 * editable, deletable like any other.
 */
export function createRecurrenceOverride(
    tree: YTree,
    source: Item,
    occurrence: { occurrenceId: string; startUtcMs: number; },
    edits: OverrideEdits = {},
): Item {
    const parentKey = tree.getNodeParentFromKey(source.key);
    if (!parentKey) {
        throw new Error(`Recurring item "${source.key}" has no parent to create the override under`);
    }
    // `start` requires its `allDay` shape (§6.1): a recurring item that never
    // set it explicitly still generates timed (instant) occurrences.
    const allDay = source.allDay ?? false;
    const override = new Items(source.ydoc, tree, parentKey).addNode(source.author);
    override.text = edits.text ?? source.text;
    override.tags = source.tags;
    override.allDay = allDay;
    override.duration = edits.duration ?? source.duration;
    override.start = formatOccurrenceStart(occurrence.startUtcMs, allDay);
    override.recurrenceParentId = source.id;
    override.recurrenceOccurrenceId = occurrence.occurrenceId;
    return override;
}

function formatOccurrenceStart(startUtcMs: number, allDay: boolean | undefined): string {
    const iso = new Date(startUtcMs).toISOString();
    if (allDay) return iso.slice(0, 10);
    return iso.replace(/\.\d{3}Z$/, "Z");
}

/**
 * Records one occurrence as cancelled. If `override` is the materialized
 * override for that same occurrence, it is deleted too — otherwise the
 * virtual occurrence would simply reappear at its original, un-overridden
 * time once the override that used to stand in for it is gone.
 */
export function deleteOccurrence(
    tree: YTree,
    source: Item,
    occurrenceId: string,
    override?: Item,
): void {
    source.addRecurrenceExdate(occurrenceId);
    if (
        override
        && override.recurrenceParentId === source.id
        && override.recurrenceOccurrenceId === occurrenceId
    ) {
        tree.deleteNodeAndDescendants(override.key);
    }
}

export interface SplitEdits {
    text?: string;
    duration?: string;
    allDay?: boolean;
    /** New local wall-clock dtstart for the continuation, if the time of day also changes. Defaults to `occurrenceId`. */
    dtstart?: string;
}

/**
 * "This and following": truncates `source`'s rule so it stops at the
 * occurrence just before `occurrenceId`, and starts a new item continuing
 * the series from `occurrenceId` onward, with `edits` applied to it. A
 * bounded rule's remaining `COUNT` is carried over rather than restarted.
 *
 * When `occurrenceId` is the series' very first occurrence, there is
 * nothing to split off before it — this degenerates to "all events" and
 * `edits` are applied to `source` in place instead.
 */
export function splitRecurrenceAtOccurrence(
    tree: YTree,
    source: Item,
    occurrenceId: string,
    edits: SplitEdits = {},
): Item {
    if (!source.rrule || !source.recurrenceDtstart || !source.recurrenceTimezone) {
        throw new Error(`Item "${source.key}" is not a recurring item`);
    }
    const dtstartWall = parseWallTime(source.recurrenceDtstart);
    const occurrenceWall = parseWallTime(occurrenceId);
    if (!dtstartWall || !occurrenceWall) {
        throw new Error("Invalid dtstart or occurrenceId");
    }

    const floatingDtstart = wallTimeToFloatingDate(dtstartWall);
    const floatingOccurrence = wallTimeToFloatingDate(occurrenceWall);

    const parsed = rrulestr(source.rrule, { dtstart: floatingDtstart });
    if (!(parsed instanceof RRule)) {
        throw new Error("Calendar recurrence does not support EXDATE/RDATE embedded in the RRULE string");
    }

    const prev = parsed.before(floatingOccurrence, false);
    // `origOptions.dtstart` is only the *parsing* dtstart passed in above; a
    // serialized rule must never carry it, or `.toString()` embeds a
    // `DTSTART:` line that would silently disagree with (and take priority
    // over, in some callers) `recurrenceDtstart` — the one place dtstart is
    // meant to live (bare-body convention, see `Item.rrule`).
    const { dtstart: _dtstart, ...ruleOptions } = parsed.origOptions;

    if (!prev) {
        if (edits.text !== undefined) source.text = edits.text;
        if (edits.duration !== undefined) source.duration = edits.duration;
        if (edits.allDay !== undefined) source.allDay = edits.allDay;
        if (edits.dtstart !== undefined) source.recurrenceDtstart = edits.dtstart;
        return source;
    }

    let remainingCount: number | undefined;
    if (typeof ruleOptions.count === "number") {
        const kept = parsed.between(floatingDtstart, prev, true).length;
        remainingCount = Math.max(ruleOptions.count - kept, 0);
    }

    source.rrule = new RRule({ ...ruleOptions, until: prev, count: undefined }).toString();

    const parentKey = tree.getNodeParentFromKey(source.key);
    if (!parentKey) {
        throw new Error(`Recurring item "${source.key}" has no parent to create the continuation under`);
    }
    const next = new Items(source.ydoc, tree, parentKey).addNode(source.author);
    next.text = edits.text ?? source.text;
    next.tags = source.tags;
    next.allDay = edits.allDay ?? source.allDay;
    next.duration = edits.duration ?? source.duration;
    next.recurrenceTimezone = source.recurrenceTimezone;
    next.recurrenceDtstart = edits.dtstart ?? occurrenceId;
    next.rrule = new RRule({ ...ruleOptions, count: remainingCount }).toString();

    // Exceptions at/after the split point belong to the continuation.
    for (const exdate of source.recurrenceExdate) {
        if (exdate >= occurrenceId) {
            next.addRecurrenceExdate(exdate);
            source.removeRecurrenceExdate(exdate);
        }
    }

    return next;
}
