// Deciding whether a calendar entry stands for an *outline item*, and which
// one (#4981).
//
// A calendar row addresses its source with `source_kind`/`source_id`
// (queryAnalysis.ts). `source_kind` is whatever the query's SELECT list says,
// though — the existing calendar e2e queries write `'item' AS source_kind`
// over `outline_items` — so trusting the literal alone would both miss real
// outline rows and accept a table row that happened to spell the same word.
//
// So identity here is structural: `source_id` must name a node that actually
// exists in the project's outline tree. That is the same key
// `itemsRelation.ts` projects as the `id` column and the same key
// `OutlinerItem` renders, so a match means "this row is that item" — never a
// title/text comparison, which would be exactly the text-based matching the
// feature forbids. The source-kind list below only serves callers that have
// no tree to check against (unit tests, pure formatting paths).

import { ITEMS_RELATION_NAME } from "../yjstable/itemsRelation";
import type { CalendarEntry } from "./calendarEntries";

/**
 * Source-kind literals that name the outline-items relation. `outline_items`
 * is the canonical reserved SQL name; `items` is what `calendarEntries.ts`'s
 * recurrence branch has always accepted, and `item` is what the shipped
 * example queries write.
 */
export const OUTLINE_ITEM_SOURCE_KINDS: ReadonlySet<string> = new Set([
    ITEMS_RELATION_NAME,
    "items",
    "item",
    "outline_item",
]);

export function isOutlineItemSourceKind(sourceKind: string | undefined): boolean {
    return sourceKind !== undefined && OUTLINE_ITEM_SOURCE_KINDS.has(sourceKind);
}

/**
 * The outline item an entry stands for, or undefined when it stands for
 * something else (a table row, or a row with no addressable source at all).
 *
 * `hasItem` is the authority when it is supplied: an id the outline tree
 * knows is an outline item whatever the query aliased `source_kind` to. Only
 * when no tree is available does the source-kind literal decide.
 */
export function resolveOutlineItemId(
    entry: Pick<CalendarEntry, "sourceKind" | "sourceId">,
    hasItem?: (itemId: string) => boolean,
): string | undefined {
    const sourceId = entry.sourceId;
    if (!sourceId) return undefined;
    if (hasItem) return hasItem(sourceId) ? sourceId : undefined;
    return isOutlineItemSourceKind(entry.sourceKind) ? sourceId : undefined;
}
