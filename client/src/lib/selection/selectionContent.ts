/**
 * What a selection actually contains, resolved from its endpoints (#5024, #5025).
 *
 * The endpoints say where a selection starts and ends; this module says which items -
 * and which part of each - fall between them. It works on a plain description of the
 * items the range spans, so the answer comes from the outline model rather than from
 * anything the renderer measured, and one traversal serves rendering, plain-text
 * extraction and the structured clipboard alike.
 */

import { type NormalizedSelection, type SelectionEndpoint } from "./selectionEndpoints";

/**
 * One resolved piece of a selection.
 *
 * Text nodes contribute a character interval; a visual node contributes itself, whole,
 * because it cannot be selected in halves.
 */
export type SelectionFragment =
    | { kind: "text"; itemId: string; startOffset: number; endOffset: number; }
    | { kind: "node"; itemId: string; };

/** What the selection model needs to know about one item a range spans. */
export interface SelectionRangeItem {
    itemId: string;
    /** True for Grid/Calendar/Layout - a node that owns no outline text (#5015). */
    isVisual: boolean;
    /** Length of the item's text. Meaningless for a visual node. */
    textLength: number;
    /** Enclosing item, when this one renders inside another (a Layout's children). */
    parentItemId?: string;
}

/**
 * Where an endpoint falls in a string of `textLength` characters.
 *
 * A text endpoint gives its own offset, clamped to the text it addresses. A node boundary
 * gives an edge of it: `before` is the start, `after` is the end - which for the textless
 * visual node the boundary belongs to are the same, empty, position. This is the one place
 * that translation happens, so an editing routine never has to guess an offset for a block.
 */
export function endpointOffsetInText(endpoint: SelectionEndpoint, textLength: number): number {
    if (endpoint.kind === "text") return Math.max(0, Math.min(textLength, endpoint.offset));
    return endpoint.side === "before" ? 0 : textLength;
}

/**
 * Selected character interval for one Text item of a normalized selection.
 *
 * Items strictly between the endpoints are fully selected; an endpoint clips its own item.
 * A node boundary can still land on a Text item - a range may start after the node that
 * precedes it - and then it clips nothing: `before` leaves the whole text ahead of it
 * selected, `after` leaves all of it behind. Returns undefined when nothing is selected.
 */
export function getItemSelectionInterval(
    itemId: string,
    normalized: NormalizedSelection,
    textLength: number,
): { startOffset: number; endOffset: number; } | undefined {
    const startOffset = normalized.first.itemId === itemId ? endpointOffsetInText(normalized.first, textLength) : 0;
    const endOffset = normalized.last.itemId === itemId
        ? endpointOffsetInText(normalized.last, textLength)
        : textLength;

    if (startOffset >= endOffset) return undefined;
    return { startOffset, endOffset };
}

/**
 * Whether an atomic visual node the range spans is itself selected.
 *
 * Only its own endpoints can leave it out: a node reached from `before` it is inside the
 * selection, one the selection starts `after` is not.
 *
 * @param textEndpointStopsShort How to read a *text* endpoint that names a visual node -
 * a position this model no longer produces, but one a drag or a stale payload can still
 * hand over. The overlay reads it as a node the drag stopped at rather than reached and
 * leaves it unhighlighted (#5022); the clipboard reads it as reached, because a block has
 * no interior to stop short of and cannot travel in halves.
 */
export function isVisualNodeSelected(
    itemId: string,
    normalized: NormalizedSelection,
    textEndpointStopsShort = true,
): boolean {
    const excludes = (endpoint: SelectionEndpoint, excludingSide: "before" | "after") => {
        if (endpoint.itemId !== itemId) return false;
        return endpoint.kind === "text" ? textEndpointStopsShort : endpoint.side === excludingSide;
    };

    // A range starting after the node, or ending before it, leaves it out; anything else
    // spanning it contains it whole.
    return !excludes(normalized.first, "after") && !excludes(normalized.last, "before");
}

/**
 * Turn the items a selection spans into the fragments it selects, in document order.
 *
 * Three rules, and no block-specific knowledge beyond them:
 *
 * - a Text node contributes its selected character interval;
 * - a visual node contributes one atomic node fragment, or nothing when an endpoint
 *   boundary excludes it - never text offsets;
 * - a node drawn inside an already selected visual node contributes nothing, because it
 *   is already part of that node. That is what makes a selected Layout resolve to one
 *   container instead of to a stack of its children.
 */
export function resolveSelectionFragments(
    items: readonly SelectionRangeItem[],
    normalized: NormalizedSelection,
): SelectionFragment[] {
    const fragments: SelectionFragment[] = [];
    // Items whose own fragment already covers everything rendered inside them.
    const absorbing = new Set<string>();

    for (const item of items) {
        if (item.parentItemId !== undefined && absorbing.has(item.parentItemId)) {
            absorbing.add(item.itemId);
            continue;
        }

        if (item.isVisual) {
            // Whether or not it is selected, its children are part of its picture.
            absorbing.add(item.itemId);
            if (isVisualNodeSelected(item.itemId, normalized)) fragments.push({ kind: "node", itemId: item.itemId });
            continue;
        }

        const interval = getItemSelectionInterval(item.itemId, normalized, item.textLength);
        if (interval) fragments.push({ kind: "text", itemId: item.itemId, ...interval });
    }

    return fragments;
}

/**
 * The plain-text flavor of a resolved selection.
 *
 * Text fragments contribute their characters, one line per item. A visual node drops out
 * entirely - not even a blank line: plain text carries what the outline holds, and
 * inventing a label, a caption or an empty row for a block would put text on the clipboard
 * that no item ever had (#5015). The structured flavor is where blocks travel.
 */
export function selectionFragmentsToPlainText(
    fragments: readonly SelectionFragment[],
    textOf: (itemId: string) => string,
): string {
    return fragments
        .filter((fragment): fragment is Extract<SelectionFragment, { kind: "text"; }> => fragment.kind === "text")
        .map(fragment => textOf(fragment.itemId).substring(fragment.startOffset, fragment.endOffset))
        .join("\n");
}
