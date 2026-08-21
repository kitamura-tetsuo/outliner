/**
 * Tree operations for the Layout container (#4997).
 *
 * Every operation here is an ordinary Yjs tree mutation — the same
 * moveChildToParent / setNodeBefore / setNodeAfter primitives item drag & drop
 * already uses — with the Layout child constraint applied on top. Nothing
 * maintains a layout-specific node graph, and no placement coordinate is ever
 * written: order is the tree, width is each child's `columnSpan`.
 */

import { getLogger } from "../../lib/logger";
import type { Item } from "../../schema/app-schema";
import {
    canBeLayoutChild,
    DEFAULT_COLUMN_SPAN,
    isLayoutComponentType,
    LAYOUT_COLUMN_COUNT,
    normalizeColumnSpan,
} from "./layoutModel";

const logger = getLogger("layoutTree");

/** Where a move places the moved item relative to a reference item. */
export type LayoutDropPosition = "before" | "after";

/** True when this item is a Layout container. */
export function isLayoutItem(item: Item | undefined): boolean {
    if (!item) return false;
    try {
        return isLayoutComponentType(item.componentType);
    } catch (error) {
        logger.warn({ error }, "isLayoutItem: unreadable item");
        return false;
    }
}

/** A Layout's direct children, in tree order. */
export function layoutChildren(layout: Item): Item[] {
    try {
        return [...layout.items];
    } catch (error) {
        logger.warn({ error }, "layoutChildren: unreadable children");
        return [];
    }
}

/**
 * True when `candidate` may become a direct child of a Layout: it has to be a
 * visual block. Ordinary text items and nested Layouts are refused, and the
 * caller is expected to leave the tree untouched when this is false.
 */
export function canAcceptAsLayoutChild(candidate: Item | undefined): boolean {
    if (!candidate) return false;
    try {
        return canBeLayoutChild(candidate.componentType);
    } catch (error) {
        logger.warn({ error }, "canAcceptAsLayoutChild: unreadable item");
        return false;
    }
}

/** The rendered span of a Layout child, repaired into 1..12. */
export function columnSpanOf(item: Item): number {
    try {
        return normalizeColumnSpan(item.columnSpan);
    } catch (error) {
        logger.warn({ error }, "columnSpanOf: unreadable span");
        return DEFAULT_COLUMN_SPAN;
    }
}

/** Persist a child's span, clamped to 1..12. Never reorders the tree. */
export function setColumnSpan(item: Item, span: number): number {
    const normalized = normalizeColumnSpan(span);
    try {
        item.columnSpan = normalized;
    } catch (error) {
        logger.warn({ error }, "setColumnSpan: failed to write span");
    }
    return normalized;
}

/** Widen or narrow a child by whole columns, clamped to 1..12. */
export function adjustColumnSpan(item: Item, delta: number): number {
    return setColumnSpan(item, columnSpanOf(item) + delta);
}

function treeOf(item: Item) {
    return item.tree as unknown as {
        moveChildToParent: (childKey: string, parentKey: string) => void;
        setNodeBefore: (nodeKey: string, target: string) => void;
        setNodeAfter: (nodeKey: string, target: string) => void;
        setNodeOrderToEnd: (nodeKey: string) => void;
        setNodeOrderToStart: (nodeKey: string) => void;
        deleteNodeAndDescendants: (nodeKey: string) => void;
        recomputeParentsAndChildren?: () => void;
    };
}

/** Run `mutate` in one Yjs transaction so collaborators see an atomic move. */
function transact(item: Item, mutate: () => void): void {
    const doc = item.ydoc;
    if (typeof doc?.transact === "function") doc.transact(mutate, null);
    else mutate();
}

function recompute(item: Item): void {
    treeOf(item).recomputeParentsAndChildren?.();
}

/**
 * Move a visual item into `layout`, at `index` among the Layout's children
 * (appended when omitted). Returns false — leaving the tree unchanged — when
 * the item is not an eligible visual block, which is how a rejected drop
 * behaves.
 */
export function moveIntoLayout(layout: Item, source: Item, index?: number): boolean {
    if (!isLayoutItem(layout) || !canAcceptAsLayoutChild(source)) return false;
    if (source.key === layout.key) return false;

    const tree = treeOf(layout);
    try {
        transact(layout, () => {
            const before = layoutChildren(layout).filter(child => child.key !== source.key);
            tree.moveChildToParent(source.key, layout.key);
            recompute(layout);

            if (index === undefined || index >= before.length) {
                tree.setNodeOrderToEnd(source.key);
            } else if (index <= 0) {
                tree.setNodeBefore(source.key, before[0].key);
            } else {
                tree.setNodeAfter(source.key, before[index - 1].key);
            }

            if (source.columnSpan === undefined) source.columnSpan = DEFAULT_COLUMN_SPAN;
        });
        return true;
    } catch (error) {
        logger.error({ error }, "moveIntoLayout: failed");
        return false;
    }
}

/**
 * Reorder a child within its Layout. The result is a plain tree reorder — CSS
 * Grid auto-placement follows tree order, so nothing about placement is
 * written.
 */
export function moveWithinLayout(
    layout: Item,
    source: Item,
    target: Item,
    position: LayoutDropPosition,
): boolean {
    if (!isLayoutItem(layout)) return false;
    if (source.key === target.key) return false;

    const keys = new Set(layoutChildren(layout).map(child => child.key));
    if (!keys.has(source.key) || !keys.has(target.key)) return false;

    const tree = treeOf(layout);
    try {
        transact(layout, () => {
            if (position === "before") tree.setNodeBefore(source.key, target.key);
            else tree.setNodeAfter(source.key, target.key);
        });
        return true;
    } catch (error) {
        logger.error({ error }, "moveWithinLayout: failed");
        return false;
    }
}

/**
 * Move a child out of its Layout, back into normal outline flow as a sibling
 * of the Layout itself. The child's `columnSpan` is cleared: it means nothing
 * outside a Layout, and dropping it keeps the item's metadata honest rather
 * than leaving a stale width behind.
 */
export function moveOutOfLayout(
    layout: Item,
    source: Item,
    position: LayoutDropPosition = "after",
): boolean {
    if (!isLayoutItem(layout)) return false;
    if (!layoutChildren(layout).some(child => child.key === source.key)) return false;

    const parent = layout.parent;
    if (!parent) return false;

    const tree = treeOf(layout);
    try {
        transact(layout, () => {
            tree.moveChildToParent(source.key, parent.parentKey);
            recompute(layout);
            if (position === "before") tree.setNodeBefore(source.key, layout.key);
            else tree.setNodeAfter(source.key, layout.key);
            source.columnSpan = undefined;
        });
        return true;
    } catch (error) {
        logger.error({ error }, "moveOutOfLayout: failed");
        return false;
    }
}

/**
 * Remove the Layout while keeping what it arranged: its children move to the
 * Layout's own parent, at the Layout's position and in the same order, each
 * keeping its component binding, and only the Layout item itself is deleted.
 *
 * This is deliberately distinct from deleting the Layout, which follows normal
 * subtree deletion and takes the children with it.
 */
export function unwrapLayout(layout: Item): boolean {
    if (!isLayoutItem(layout)) return false;

    const parent = layout.parent;
    if (!parent) return false;

    const tree = treeOf(layout);
    try {
        transact(layout, () => {
            // Placing each child immediately before the Layout, front to back,
            // reproduces the children's order at the Layout's own position.
            for (const child of layoutChildren(layout)) {
                tree.moveChildToParent(child.key, parent.parentKey);
                recompute(layout);
                tree.setNodeBefore(child.key, layout.key);
                child.columnSpan = undefined;
            }
            tree.deleteNodeAndDescendants(layout.key);
            recompute(layout);
        });
        return true;
    } catch (error) {
        logger.error({ error }, "unwrapLayout: failed");
        return false;
    }
}

/**
 * Whether the running total of spans up to (and including) `index` starts a new
 * grid row — the same wrap CSS Grid auto-placement performs. Exposed for tests
 * and for the guide overlay; rendering itself never computes positions.
 */
export function rowIndexOfChild(spans: number[], index: number): number {
    let row = 0;
    let used = 0;
    for (let i = 0; i <= index && i < spans.length; i++) {
        const span = normalizeColumnSpan(spans[i]);
        if (used + span > LAYOUT_COLUMN_COUNT) {
            row++;
            used = span;
        } else {
            used += span;
        }
    }
    return row;
}
