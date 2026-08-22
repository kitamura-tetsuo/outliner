/**
 * What the rendered outline tells the selection model (#5026).
 *
 * Two questions are asked of the document rather than of any component's internals:
 *
 * - *where did this gesture land?* - on the outline layer, or inside a block that owns
 *   its own pointer interactions;
 * - *what rows are there, in order, and which of them are atomic visual nodes?*
 *
 * Both answers come from stable attributes a row or a block publishes about itself
 * (`data-item-id`, `data-node-kind`, `data-visual-node-root`, and the selection surface
 * below), never from a Grid's or a Calendar's markup. A future block joins the model by
 * carrying the attributes, exactly as it joins the overlay's geometry (#5024).
 */

import { escapeId } from "../../utils/domUtils";
import { VISUAL_NODE_ROOT_ATTRIBUTE } from "../selectionGeometry";
import type { OutlineRow } from "./selectionKeyboard";

/**
 * Attribute marking the outline layer's own selection surface inside a visual block.
 *
 * A Grid, Calendar or Layout owns every pointer gesture on its content: dragging text in
 * a cell, pressing a button, resizing a column. So the outline does not take clicks away
 * from it - it renders a surface *of its own* alongside the block (a gutter down the
 * block's outer edge) and starts node selection only from there. The value is the item id
 * of the node the surface belongs to, though a surface nested inside a Layout resolves to
 * the outermost block: that is the row the outline actually holds.
 */
export const VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE = "data-visual-node-selection-surface";

function elementOf(target: EventTarget | null | undefined): Element | undefined {
    if (!target || typeof (target as Element).closest !== "function") return undefined;
    return target as Element;
}

/**
 * The outermost visual node an element is rendered inside, if any.
 *
 * Outermost, not nearest: a Grid inside a Layout is drawn within the Layout's own block,
 * and it is the Layout that is the outline row. Resolving upwards is what keeps a Layout
 * selection one container rectangle instead of one per visual descendant.
 */
export function outermostVisualNodeId(target: EventTarget | null | undefined): string | undefined {
    let element = elementOf(target);
    let outermost: string | undefined;

    while (element) {
        const root = element.closest(`[${VISUAL_NODE_ROOT_ATTRIBUTE}]`);
        if (!root) break;
        outermost = root.getAttribute(VISUAL_NODE_ROOT_ATTRIBUTE) ?? outermost;
        element = root.parentElement ?? undefined;
    }

    return outermost;
}

/**
 * The outline node a gesture selects, or undefined when the gesture is not on the outline
 * layer's own selection surface.
 */
export function outlineSelectionSurfaceItemId(target: EventTarget | null | undefined): string | undefined {
    const element = elementOf(target);
    const surface = element?.closest(`[${VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE}]`);
    if (!surface) return undefined;
    return outermostVisualNodeId(surface)
        ?? surface.getAttribute(VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE)
        ?? undefined;
}

/**
 * True when a gesture belongs to an embedded block rather than to the outline.
 *
 * Everything drawn inside a block is the block's, with the single exception of the
 * outline's own selection surface. Stated as one predicate so no call site has to
 * re-decide the ownership boundary for itself.
 */
export function isBlockOwnedInteraction(target: EventTarget | null | undefined): boolean {
    if (outlineSelectionSurfaceItemId(target) !== undefined) return false;
    return outermostVisualNodeId(target) !== undefined;
}

/**
 * True when the rendered row for `itemId` is an atomic visual node (#5015).
 *
 * The row publishes its own kind, so this answers the question without a tree lookup and
 * without the store having to know what a Grid or a Calendar is.
 */
export function isVisualRow(itemId: string): boolean {
    if (typeof document === "undefined") return false;
    const row = document.querySelector(`.outliner-item[data-item-id="${escapeId(itemId)}"]`);
    const nodeKind = row?.getAttribute("data-node-kind");
    return nodeKind !== null && nodeKind !== undefined && nodeKind !== "text";
}

/**
 * The outline's rows, in rendered order, as the selection model needs to see them.
 *
 * Only top-level rows (`.outliner-item`) count: a Layout's children carry `data-item-id`
 * too, but they are part of their container's picture rather than rows the outline
 * navigates through.
 */
export function readOutlineRows(): OutlineRow[] {
    if (typeof document === "undefined") return [];

    return Array.from(document.querySelectorAll(".outliner-item[data-item-id]")).flatMap(element => {
        const itemId = element.getAttribute("data-item-id");
        if (!itemId) return [];
        const nodeKind = element.getAttribute("data-node-kind");
        return [{
            itemId,
            isVisual: nodeKind !== null && nodeKind !== "text",
            textLength: element.querySelector(".item-text")?.textContent?.length ?? 0,
        }];
    });
}
