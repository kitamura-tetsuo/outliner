import { canAcceptChild } from "$shared/services/outlineNodeKind";
import * as Y from "yjs";
import { Item } from "../../schema/app-schema";
import { isTextNode } from "../../services/outline/nodeTree";

interface MutableOrderedTree {
    hasNode?(key: string): boolean;
    getNodeChildrenFromKey(key: string): string[];
    getNodeParentFromKey(key: string): string | undefined;
    sortChildrenByOrder(keys: string[], parentKey: string): string[];
    moveChildToParent(childKey: string, parentKey: string): void;
    setNodeBefore(key: string, beforeKey: string): void;
    setNodeOrderToEnd(key: string): void;
    deleteNodeAndDescendants(key: string): void;
    recomputeParentsAndChildren?(): void;
}

export type BoundaryTreeEdit =
    | { kind: "merge"; source: Item; survivor: Item; mergedText: string; }
    | { kind: "promote"; source: Item; };

function exists(tree: MutableOrderedTree, key: string): boolean {
    return typeof tree.hasNode !== "function" || tree.hasNode(key);
}

function parentOf(tree: MutableOrderedTree, key: string): string | undefined {
    try {
        return tree.getNodeParentFromKey(key);
    } catch {
        return undefined;
    }
}

function orderedChildren(tree: MutableOrderedTree, key: string): string[] | undefined {
    if (!exists(tree, key)) return undefined;
    try {
        return tree.sortChildrenByOrder(tree.getNodeChildrenFromKey(key), key);
    } catch {
        return undefined;
    }
}

/**
 * Applies one validated outline-boundary edit. Immediate children are moved as
 * their original nodes before the now-childless source is recursively removed.
 */
export function applyBoundaryTreeEdit(edit: BoundaryTreeEdit): boolean {
    const { source } = edit;
    const tree = source.tree as unknown as MutableOrderedTree;
    const sourceKey = source.key;
    const sourceParent = parentOf(tree, sourceKey);
    const sourceChildren = orderedChildren(tree, sourceKey);
    if (!sourceParent || !sourceChildren || !exists(tree, sourceParent)) return false;

    const parentChildren = orderedChildren(tree, sourceParent);
    if (!parentChildren || !parentChildren.includes(sourceKey)) return false;

    let destinationKey = sourceParent;
    let destination: Item | undefined = sourceParent === "root"
        ? undefined
        : new Item(source.ydoc, source.tree, sourceParent);
    let replaceSourceSlot = true;

    if (edit.kind === "merge") {
        const survivor = edit.survivor;
        if (survivor.ydoc !== source.ydoc || survivor.tree !== source.tree || survivor.key === sourceKey) return false;
        if (!isTextNode(source) || !isTextNode(survivor)) return false;
        const sourceText = source.yMap.get("text");
        const survivorText = survivor.yMap.get("text");
        // Item.text deliberately presents absent storage as an empty string.
        // Boundary merges must instead distinguish valid empty Y.Text values
        // from missing/stale backing data before any child is moved.
        if (
            !(sourceText instanceof Y.Text)
            || !(survivorText instanceof Y.Text)
            || sourceText.doc !== source.ydoc
            || survivorText.doc !== survivor.ydoc
        ) return false;
        if (!exists(tree, survivor.key) || parentOf(tree, survivor.key) === undefined) return false;
        destinationKey = survivor.key;
        destination = survivor;
        replaceSourceSlot = sourceParent === survivor.key;
    }

    const childItems = sourceChildren.map(key => new Item(source.ydoc, source.tree, key));
    if (
        childItems.some((child, index) =>
            !exists(tree, child.key)
            || parentOf(tree, child.key) !== sourceKey
            || child.key !== sourceChildren[index]
            || !canAcceptChild(destination, child)
        )
    ) return false;

    const destinationChildren = orderedChildren(tree, destinationKey);
    if (!destinationChildren) return false;
    if (replaceSourceSlot && !destinationChildren.includes(sourceKey)) return false;

    source.ydoc.transact(() => {
        for (const childKey of sourceChildren) {
            tree.moveChildToParent(childKey, destinationKey);
            tree.recomputeParentsAndChildren?.();
            if (replaceSourceSlot) tree.setNodeBefore(childKey, sourceKey);
            else tree.setNodeOrderToEnd(childKey);
            tree.recomputeParentsAndChildren?.();
        }

        if (edit.kind === "merge") edit.survivor.updateText(edit.mergedText);
        tree.deleteNodeAndDescendants(sourceKey);
    }, null);
    return true;
}
