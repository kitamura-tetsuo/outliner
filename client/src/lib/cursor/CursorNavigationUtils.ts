import type { Item } from "../../schema/yjs-schema";
import { store as generalStore } from "../../stores/store.svelte";

function collectChildren(node: Item): Item[] {
    const items = node.items as Iterable<Item> | undefined;
    if (!items || typeof (items as any)[Symbol.iterator] !== "function") {
        return [];
    }

    const children: Item[] = [];
    for (const child of items) {
        children.push(child);
    }
    return children;
}

/**
 * Find the previous item in the tree relative to the provided ID.
 */
export function findPreviousItem(currentItemId: string): Item | undefined {
    const root = generalStore.currentPage;
    if (!root) return undefined;

    return findPreviousItemRecursive(root, currentItemId);
}

function findPreviousItemRecursive(node: Item, targetId: string, prevItem?: Item): Item | undefined {
    if (node.id === targetId) {
        return prevItem;
    }

    const children = collectChildren(node);
    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child.id === targetId) {
            return i > 0 ? children[i - 1] : node;
        }

        const found = findPreviousItemRecursive(child, targetId, i > 0 ? children[i - 1] : node);
        if (found) return found;
    }

    return undefined;
}

/**
 * Find the next item in the tree relative to the provided ID.
 */
export function findNextItem(currentItemId: string): Item | undefined {
    const root = generalStore.currentPage;
    if (!root) return undefined;

    return findNextItemRecursive(root, currentItemId);
}

function findNextItemRecursive(node: Item, targetId: string): Item | undefined {
    if (node.id === targetId) {
        const iterator = node.items as Iterable<Item> | undefined;
        if (iterator && typeof (iterator as any)[Symbol.iterator] === "function") {
            const first = (iterator as Iterable<Item>)[Symbol.iterator]().next();
            if (!first.done) return first.value;
        }
        return undefined;
    }

    const children = collectChildren(node);
    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child.id === targetId) {
            if (i < children.length - 1) {
                return children[i + 1];
            }
            return undefined;
        }

        const found = findNextItemRecursive(child, targetId);
        if (found) return found;
    }

    return undefined;
}

/**
 * Depth-first search for an item by ID.
 */
export function searchItem(node: Item, id: string): Item | undefined {
    if (node.id === id) return node;

    for (const child of collectChildren(node)) {
        const found = searchItem(child, id);
        if (found) return found;
    }

    return undefined;
}
