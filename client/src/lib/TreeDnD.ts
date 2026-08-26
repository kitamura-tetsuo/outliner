import type { YTree } from "yjs-orderedtree";
import type { Item } from "../schema/app-schema";
import { DEFAULT_COLUMN_SPAN } from "../services/layout/layoutModel";
import { isLayoutItem } from "../services/layout/layoutTree";
import { canAcceptChild, canPlaceBeside } from "../services/outline/nodeTree";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import type { DisplayItem } from "../stores/OutlinerViewModel";
import { safeGetNodeParent } from "../utils/treeUtils";
import { getLogger } from "./logger";

const logger = getLogger("TreeDnD");

/**
 * Structural context the item-reordering drag-and-drop controller needs from its host
 * component (OutlinerTree.svelte). Mirrors the constructor-injection pattern used by
 * CursorNavigation (client/src/lib/cursor/CursorNavigation.ts).
 *
 * NOTE: File-upload drag-and-drop (attachments) is intentionally NOT part of this
 * controller -- it stays inline in OutlinerTree.svelte / OutlinerItem.svelte. See
 * TreeDnD's class doc comment for details.
 */
export interface TreeDnDContext {
    /** Current flattened, ordered list of visible items. Read fresh on every call. */
    readonly displayItems: DisplayItem[];
    /** The page root item, used to reach the underlying Y.Doc / ordered tree. */
    readonly pageItem: Item;
    /** Called after a structural tree mutation so the caller can force a re-render
     * (Y.Tree order-only changes don't reliably emit observeDeep events). */
    onStructureChanged(): void;
}

/**
 * Controller for item-reordering drag-and-drop: moving/reparenting an existing outline
 * item within the tree by dragging it onto another item (drop position "top" / "bottom"
 * reorders as a sibling, "middle" nests as a child).
 *
 * Scope note (see GitHub issue #3615): file-upload drag-and-drop (dragging files from
 * outside the browser to create attachments) is a distinct feature and is deliberately
 * NOT handled here. It remains inline in OutlinerTree.svelte (handleTreeDrop /
 * handleTreeDragOver) and OutlinerItem.svelte (the file branch of handleDrop), calling
 * `uploadAttachment` directly. Text-selection drag-and-drop (dragging selected text
 * between items) is also a separate feature and stays inline in OutlinerTree.svelte's
 * handleSingleItemSelectionDrop / handleMultiItemSelectionDrop.
 */
export class TreeDnD {
    private context: TreeDnDContext;

    constructor(context: TreeDnDContext) {
        this.context = context;
    }

    /** Layout children are deliberately absent from displayItems, but remain ordinary tree items. */
    private findItem(itemId: string, matchKey = false): Item | undefined {
        const visit = (items: Iterable<Item>): Item | undefined => {
            for (const item of items) {
                if ((matchKey ? item.key : item.id) === itemId) return item;
                const nested = visit(item.items);
                if (nested) return nested;
            }
            return undefined;
        };
        if ((matchKey ? this.context.pageItem.key : this.context.pageItem.id) === itemId) {
            return this.context.pageItem;
        }
        return visit(this.context.pageItem.items);
    }

    /**
     * Move (reorder or reparent) an existing item within the tree.
     * @param sourceItemId The item being dragged.
     * @param targetItemId The item being dropped onto.
     * @param position "top" (place before target), "bottom" (place after target), or
     *   "middle" (nest as a child of target).
     */
    moveItem(sourceItemId: string, targetItemId: string, position: string): void {
        const { displayItems, pageItem } = this.context;

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                `handleItemMoveDrop called with sourceItemId=${sourceItemId}, targetItemId=${targetItemId}, position=${position}`,
            );
        }

        // Get source and target item indices
        const sourceItem = this.findItem(sourceItemId);
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId,
        );

        if (!sourceItem || targetIndex < 0) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Source or target item not found: source=${Boolean(sourceItem)}, targetIndex=${targetIndex}`,
                );
            }
            return;
        }

        // Do nothing if source and target are the same item
        if (sourceItemId === targetItemId) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Source and target are the same item, no action needed`,
                );
            }
            return;
        }

        const items = pageItem.items;
        const targetItem = displayItems[targetIndex].model.original;

        const sourceKey = sourceItem.key!;
        const targetKey = targetItem.key!;

        // Nesting is governed by the node-kind rule (#5015), not by what the
        // renderer happens to show: a Grid or Calendar leaf accepts nothing, a
        // Layout accepts only visual blocks (so nested Layout stays invalid),
        // and Text accepts anything. A refused drop leaves the tree exactly as
        // it was rather than silently rehoming or converting the item.
        const droppingIntoLayout = position === "middle" && isLayoutItem(targetItem);
        if (position === "middle" && !canAcceptChild(targetItem, sourceItem)) {
            logger.debug(
                `Rejected drop: ${targetItemId} cannot accept ${sourceItemId} as a child`,
            );
            return;
        }

        // A top/bottom drop makes the source a sibling of the target, so the
        // target's own parent has to accept it - dropping ordinary text beside
        // a block inside a Layout is the same violation as dropping it in.
        if (position !== "middle" && !canPlaceBeside(targetItem, sourceItem)) {
            logger.debug(
                `Rejected drop: ${sourceItemId} cannot become a sibling of ${targetItemId}`,
            );
            return;
        }

        try {
            const tree: YTree = items.tree;
            const doc = pageItem?.ydoc;

            const sourceParent = safeGetNodeParent(tree, sourceKey);
            const targetParent = safeGetNodeParent(tree, targetKey);
            const sourceParentItem = sourceParent ? this.findItem(sourceParent, true) : undefined;

            const run = () => {
                // Middle drop should nest under the target item.
                if (position === "middle") {
                    if (sourceParent !== targetKey) {
                        tree.moveChildToParent(sourceKey, targetKey);
                    }
                    if (typeof tree.recomputeParentsAndChildren === "function") {
                        tree.recomputeParentsAndChildren();
                    }

                    tree.setNodeOrderToEnd(sourceKey);
                    // A block entering a Layout needs a width; everything else
                    // about its placement follows from tree order.
                    if (droppingIntoLayout && sourceItem.columnSpan === undefined) {
                        sourceItem.columnSpan = DEFAULT_COLUMN_SPAN;
                    } else if (isLayoutItem(sourceParentItem) && !droppingIntoLayout) {
                        // A middle drop onto Text also leaves the source Layout.
                        sourceItem.columnSpan = undefined;
                    }
                    return;
                }

                // For top/bottom drops, ensure the item is a sibling before reordering.
                if (
                    sourceParent
                    && targetParent
                    && sourceParent !== targetParent
                ) {
                    tree.moveChildToParent(sourceKey, targetParent);
                }

                if (typeof tree.recomputeParentsAndChildren === "function") {
                    tree.recomputeParentsAndChildren();
                }

                if (position === "top") {
                    tree.setNodeBefore(sourceKey, targetKey);
                } else {
                    tree.setNodeAfter(sourceKey, targetKey);
                }

                // A span describes membership in a Layout, not the block itself.
                if (isLayoutItem(sourceParentItem) && sourceParent !== targetParent) {
                    sourceItem.columnSpan = undefined;
                }
            };

            if (typeof doc?.transact === "function") {
                doc.transact(run, null);
            } else {
                run();
            }

            // Ensure derived display list re-renders after order-only updates (Y.Tree order changes don't emit observeDeep events reliably)
            this.context.onStructureChanged();

            editorOverlayStore.setCursor({
                itemId: sourceItemId,
                offset: 0,
                isActive: true,
                userId: "local",
            });

            editorOverlayStore.setActiveItem(sourceItemId);
            editorOverlayStore.clearSelections();
        } catch (error) {
            logger.error({ error }, "Failed to move item:");
        }
    }
}
