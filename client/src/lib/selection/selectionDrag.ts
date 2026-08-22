/**
 * From a gesture's landing place to the selection's logical endpoints (#5026).
 *
 * A pointer lands somewhere; the selection model needs two endpoints. For a Text node the
 * translation is the character offset it has always been. For a Grid, Calendar or Layout
 * there is no character to point at (#5015), so a gesture on one resolves to the node
 * *itself* - an atomic target - and this module decides which of its two boundaries
 * (#5025) each end of the range takes.
 *
 * One rule does all of it:
 *
 * > the endpoint that comes first in document order takes the `before` side, the one that
 * > comes last takes `after`.
 *
 * A node named by a gesture is therefore always inside the resulting range, whichever end
 * of the drag it is and whichever direction the drag ran in - which is what makes a click
 * select exactly one block, and a forward drag select exactly what its reverse does.
 *
 * Free of the DOM on purpose: hit testing decides *what* was hit, this decides what that
 * means for the selection, and the two can be tested apart.
 */

import {
    type ItemOrderComparator,
    nodeBoundaryEndpoint,
    type SelectionEndpoint,
    textEndpoint,
} from "./selectionEndpoints";

/**
 * What a gesture landed on, in the outline's own terms.
 *
 * A text target carries the offset it resolved to; a node target carries nothing else,
 * because an atomic node has no interior a pointer could distinguish.
 */
export type SelectionTarget =
    | { kind: "text"; itemId: string; offset: number; }
    | { kind: "node"; itemId: string; };

export function textTarget(itemId: string, offset: number): SelectionTarget {
    return { kind: "text", itemId, offset };
}

export function nodeTarget(itemId: string): SelectionTarget {
    return { kind: "node", itemId };
}

/**
 * The target an existing endpoint denotes.
 *
 * Extending a selection re-derives which boundary of a node the range needs, so the side
 * an endpoint currently carries is deliberately dropped here rather than carried along.
 */
export function targetOfEndpoint(endpoint: SelectionEndpoint): SelectionTarget {
    return endpoint.kind === "text"
        ? textTarget(endpoint.itemId, endpoint.offset)
        : nodeTarget(endpoint.itemId);
}

/** The endpoint a target denotes on the given side of the range. */
function endpointOfTarget(target: SelectionTarget, side: "before" | "after"): SelectionEndpoint {
    return target.kind === "text"
        ? textEndpoint(target.itemId, target.offset)
        : nodeBoundaryEndpoint(target.itemId, side);
}

/** A selection expressed the way the store holds it: document order, plus its direction. */
export interface DragSelection {
    /** The endpoint first in document order. */
    start: SelectionEndpoint;
    /** The endpoint last in document order. */
    end: SelectionEndpoint;
    /** True when the moving end (the focus) precedes the fixed end (the anchor). */
    isReversed: boolean;
}

/** True when `focus` sits before `anchor` in document order. */
function isReversedDrag(
    anchor: SelectionTarget,
    focus: SelectionTarget,
    compareItems: ItemOrderComparator,
): boolean {
    if (anchor.itemId !== focus.itemId) return compareItems(focus.itemId, anchor.itemId) < 0;
    // Same item: only two character offsets can be ordered against each other. Two
    // gestures on the same atomic node are the same position, so the range runs forward
    // from its `before` boundary to its `after` one and selects the node whole.
    if (anchor.kind === "text" && focus.kind === "text") return focus.offset < anchor.offset;
    return false;
}

/**
 * The selection a drag (or a Shift-click) from `anchor` to `focus` covers.
 *
 * `anchor` is the end that stays put - where the button went down, or the fixed end of an
 * existing selection - and `focus` is the end that follows the pointer.
 */
export function resolveDragSelection(
    anchor: SelectionTarget,
    focus: SelectionTarget,
    compareItems: ItemOrderComparator,
): DragSelection {
    const isReversed = isReversedDrag(anchor, focus, compareItems);
    const first = isReversed ? focus : anchor;
    const last = isReversed ? anchor : focus;
    return {
        start: endpointOfTarget(first, "before"),
        end: endpointOfTarget(last, "after"),
        isReversed,
    };
}
