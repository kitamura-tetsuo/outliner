/**
 * Tree-shape constraints derived from node kind (#5015).
 *
 * The kind rules themselves live in `$shared/services/outlineNodeKind`; this
 * module is the thin bridge that resolves an actual tree position — a parent, a
 * prospective sibling — into the two questions the editor's structural paths
 * ask before they mutate anything:
 *
 *   - may this node become a child of that one?
 *   - may this node sit beside that one?
 *
 * Drag & drop, indent and paste all go through here, so an invalid parenting
 * cannot exist merely because a renderer happens not to draw it.
 */

import { canAcceptChild, type NodeKindLike } from "$shared/services/outlineNodeKind";
import { Item } from "../../schema/app-schema";
import { safeGetNodeParent } from "../../utils/treeUtils";

export { canAcceptChild, canNodeHaveChildren, isTextNode, isVisualNode } from "$shared/services/outlineNodeKind";

/**
 * The parent of `item` as an Item, or undefined at the page root. The root
 * behaves like a Text container, which is what `canAcceptChild` assumes for an
 * absent parent.
 */
export function parentItemOf(item: Item): Item | undefined {
    try {
        const parentKey = safeGetNodeParent(item.tree, item.key);
        if (!parentKey || parentKey === "root") return undefined;
        return new Item(item.ydoc, item.tree, parentKey);
    } catch {
        return undefined;
    }
}

/** True when `child` may be placed as a sibling of `target` — i.e. under its parent. */
export function canPlaceBeside(target: Item, child: NodeKindLike): boolean {
    return canAcceptChild(parentItemOf(target), child);
}
