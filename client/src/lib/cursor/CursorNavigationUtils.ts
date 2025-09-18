// @ts-nocheck
import type { Item } from "../../schema/yjs-schema";
import { store as generalStore } from "../../stores/store.svelte";

/**
 * Find the previous item in the document
 */
export function findPreviousItem(currentItemId: string): Item | undefined {
    const root = generalStore.currentPage;
    if (!root) return undefined;

    return findPreviousItemRecursive(root, currentItemId);
}

/**
 * Recursively find the previous item
 */
function findPreviousItemRecursive(node: Item, targetId: string, prevItem?: Item): Item | undefined {
    if (node.id === targetId) {
        return prevItem;
    }

    // Get children as an array
    const children: Item[] = [];
    if (node.items && (node.items as Iterable<Item>)[Symbol.iterator]) {
        for (const child of node.items as Iterable<Item>) {
            children.push(child);
        }
    }

    // Process children in order
    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        // If this child is the target, return the previous sibling or parent
        if (child.id === targetId) {
            return i > 0 ? children[i - 1] : node;
        }

        // Recursively search descendants
        const found = findPreviousItemRecursive(child, targetId, i > 0 ? children[i - 1] : node);
        if (found) return found;
    }

    return undefined;
}

/**
 * Find the next item in the document
 */
export function findNextItem(currentItemId: string): Item | undefined {
    const root = generalStore.currentPage;
    if (!root) return undefined;

    return findNextItemRecursive(root, currentItemId);
}

/**
 * Recursively find the next item
 */
function findNextItemRecursive(node: Item, targetId: string): Item | undefined {
    if (node.id === targetId) {
        // If this node has children, return the first child
        if (node.items && (node.items as Iterable<Item>)[Symbol.iterator]) {
            const iterator = (node.items as Iterable<Item>)[Symbol.iterator]();
            const first = iterator.next();
            if (!first.done) return first.value;
        }
        return undefined; // No children, will look for next sibling in parent context
    }

    // Get children as an array
    const children: Item[] = [];
    if (node.items && (node.items as Iterable<Item>)[Symbol.iterator]) {
        for (const child of node.items as Iterable<Item>) {
            children.push(child);
        }
    }

    // Process children in order
    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child.id === targetId) {
            // If this is the target, return the next sibling if it exists
            if (i < children.length - 1) {
                return children[i + 1];
            }
            // No next sibling, will look for next in parent context
            return undefined;
        }

        const found = findNextItemRecursive(child, targetId);
        if (found) return found;
    }

    return undefined;
}

/**
 * Search for an item by ID in the document tree
 */
export function searchItem(node: Item, id: string): Item | undefined {
    if (node.id === id) return node;
    for (const child of node.items as Iterable<Item>) {
        const found = searchItem(child, id);
        if (found) return found;
    }
    return undefined;
}
