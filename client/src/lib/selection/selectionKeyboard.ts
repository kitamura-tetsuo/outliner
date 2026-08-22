/**
 * Keyboard range extension across atomic visual nodes (#5026).
 *
 * Shift+Up/Down moves the *focus* of a selection by one row. When the row it moves onto -
 * or the row the focus already sits at - is a Grid, Calendar or Layout, there is no
 * character position to move to (#5015): the focus lands on one of the node's two
 * boundaries (#5025) instead, so the node joins or leaves the range whole and no caret is
 * ever placed inside a block.
 *
 * Crossing a node therefore takes two presses, exactly as crossing a line of text takes
 * two: one to reach the node's near edge, one to reach its far edge. That keeps the
 * existing arrow/Shift convention - one press, one step - rather than inventing a
 * selection scheme of its own.
 *
 * Pure: the caller supplies the rows and reads back an endpoint, so the rule is testable
 * without a rendered outline.
 */

import { nodeBoundaryEndpoint, type SelectionEndpoint, textEndpoint } from "./selectionEndpoints";

/** One row of the outline, as keyboard extension needs to see it. */
export interface OutlineRow {
    itemId: string;
    /** True for Grid/Calendar/Layout - a node that owns no outline text (#5015). */
    isVisual: boolean;
    /** Length of the row's text. Meaningless for a visual node. */
    textLength: number;
}

/** The endpoint at the near edge of `row` when the focus arrives from `direction`. */
function edgeOfRow(row: OutlineRow, direction: "up" | "down"): SelectionEndpoint {
    if (row.isVisual) {
        // Arriving from above, the far edge of the node is `after`; from below, `before`.
        // Either way the whole node is now inside the range.
        return nodeBoundaryEndpoint(row.itemId, direction === "down" ? "after" : "before");
    }
    return textEndpoint(row.itemId, direction === "down" ? 0 : row.textLength);
}

/**
 * Where a Shift+Up/Down moves the focus when a visual node is involved, or undefined when
 * this is an ordinary text-to-text move the caret model already handles.
 *
 * @param rows the outline's rows, in document order
 * @param focus the endpoint the arrow moves
 * @param direction which way the arrow points
 */
export function extendFocusAcrossVisualNode(
    rows: readonly OutlineRow[],
    focus: SelectionEndpoint,
    direction: "up" | "down",
): SelectionEndpoint | undefined {
    const index = rows.findIndex(row => row.itemId === focus.itemId);
    if (index === -1) return undefined;

    // The focus is at one edge of a node: the next step is its other edge, which is what
    // makes a node join the range in one press and leave it again in one.
    if (focus.kind === "node-boundary") {
        const crossesOwnNode = direction === "down" ? focus.side === "before" : focus.side === "after";
        if (crossesOwnNode) {
            return nodeBoundaryEndpoint(focus.itemId, direction === "down" ? "after" : "before");
        }
    }

    const neighbour = rows[direction === "down" ? index + 1 : index - 1];
    if (!neighbour) return undefined;

    // A text focus moving onto another Text row is the ordinary case, and the caret model
    // owns it: it knows about wrapped lines and remembered columns, which rows do not.
    if (focus.kind === "text" && !neighbour.isVisual) return undefined;

    return edgeOfRow(neighbour, direction);
}
