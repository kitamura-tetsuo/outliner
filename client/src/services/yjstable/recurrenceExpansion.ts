// Bridges a recurring `Item` (Yjs) to the pure expansion logic in
// `$shared/services/calendarRecurrenceExpansion`. Not wired into
// `itemsRelation.ts`'s PGlite projection: a recurring item's virtual
// occurrences must never be materialized as stored rows (§6.2's whole
// point), and materialization here has no visible-range input yet (that
// lands with #4340's range-injection sub-issue). Until then, a calendar
// view (or a test) calls this directly with an explicit range.

import type { Item, Items } from "$shared/app-schema";
import {
    excludeOverriddenOccurrences,
    expandRecurrence,
    type RecurrenceOccurrence,
} from "$shared/services/calendarRecurrenceExpansion";
import { parseIsoDurationMs } from "$shared/utils/isoDuration";
import { iterateItems } from "$shared/utils/itemTraversal";

export interface ItemOccurrence extends RecurrenceOccurrence {
    /** `Item.id` of the recurring item this occurrence belongs to. */
    sourceItemId: string;
    /** Tree key of the recurring item, for addressing it directly. */
    sourceItemKey: string;
}

/** Whether `item` carries enough of the recurrence fields to be expanded. */
export function isRecurring(item: Item): boolean {
    return Boolean(item.rrule && item.recurrenceDtstart && item.recurrenceTimezone);
}

/** Virtual occurrences of one recurring item across a UTC range. */
export function expandItemOccurrences(
    item: Item,
    rangeStartUtcMs: number,
    rangeEndUtcMs: number,
): ItemOccurrence[] {
    if (!isRecurring(item)) return [];
    const occurrences = expandRecurrence(
        {
            rrule: item.rrule!,
            dtstart: item.recurrenceDtstart!,
            timezone: item.recurrenceTimezone!,
            exdate: item.recurrenceExdate,
            durationMs: parseIsoDurationMs(item.duration),
        },
        rangeStartUtcMs,
        rangeEndUtcMs,
    );
    return occurrences.map((o) => ({ ...o, sourceItemId: item.id, sourceItemKey: item.key }));
}

/**
 * Virtual occurrences of `item`, with any occurrence an override in
 * `siblings` already replaces excluded (§6.2: "not double-rendered
 * alongside its virtual counterpart"). Overrides are created as siblings of
 * the recurring item they override (see
 * `client/src/services/calendar/recurrenceEditing.ts`), so `siblings` is
 * ordinarily the `Items` collection `item` itself came from.
 */
export function expandItemOccurrencesWithOverrides(
    item: Item,
    siblings: Items,
    rangeStartUtcMs: number,
    rangeEndUtcMs: number,
): ItemOccurrence[] {
    const occurrences = expandItemOccurrences(item, rangeStartUtcMs, rangeEndUtcMs);
    if (occurrences.length === 0) return occurrences;

    const overrides = [...iterateItems(siblings)]
        .filter((sibling) => sibling.recurrenceParentId === item.id)
        .map((sibling) => ({ recurrenceOccurrenceId: sibling.recurrenceOccurrenceId ?? "" }));

    return excludeOverriddenOccurrences(occurrences, overrides) as ItemOccurrence[];
}
