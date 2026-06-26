import type { Item } from "../../schema/yjs-schema";
import { store as generalStore } from "../../stores/store.svelte";

function collectChildren(node: Item): Item[] {
    const items = node.items as unknown as Iterable<Item> | undefined;
    if (!items || typeof ((items as unknown) as Record<symbol, unknown>)[Symbol.iterator] !== "function") {
        return [];
    }

    const children: Item[] = [];
    for (const child of items) {
        children.push(child);
    }
    return children;
}

function getDeepestDescendant(node: Item): Item {
    const children = collectChildren(node);
    if (children.length === 0) {
        return node;
    }
    return getDeepestDescendant(children[children.length - 1]);
}

/**
 * Determine if the provided item represents a page title node.
 */
export function isPageItem(item: Item): boolean {
    const parent = item.parent;
    return !!parent && parent.parentKey === "root";
}

/**
 * Find the previous item in the tree relative to the provided ID.
 */
export function findPreviousItem(currentItemId: string): Item | undefined {
    const root = generalStore.currentPage as unknown as Item | undefined;
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

        let prevForChild;
        if (i > 0) {
            prevForChild = getDeepestDescendant(children[i - 1]);
        } else {
            // Check if node is the currentPage (the top root node)
            const isTopRoot = generalStore.currentPage && node.id === generalStore.currentPage.id;
            prevForChild = isTopRoot ? undefined : node;
        }

        if (child.id === targetId) {
            return prevForChild;
        }

        const found = findPreviousItemRecursive(child, targetId, prevForChild);
        if (found) return found;
    }

    return undefined;
}

/**
 * Find the next item in the tree relative to the provided ID.
 */
export function findNextItem(currentItemId: string): Item | undefined {
    const root = generalStore.currentPage as unknown as Item | undefined;
    if (!root) return undefined;

    // Special case: if the root itself is the target, return the first child
    if (root.id === currentItemId) {
        const children = collectChildren(root);
        return children.length > 0 ? children[0] : undefined;
    }

    // Perform the search starting from the root
    return findNextItemRecursive(root, currentItemId, []);
}

function findNextItemRecursive(node: Item, targetId: string, path: Item[]): Item | undefined {
    // If the node itself is the target, its first child is the next item (if it has children)
    if (node.id === targetId) {
        const children = collectChildren(node);
        if (children.length > 0) return children[0];
    }

    const children = collectChildren(node);
    const currentPath = [...path, node];

    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child.id === targetId) {
            // First rule of next item: if it has children, the next item is its first child
            const childChildren = collectChildren(child);
            if (childChildren.length > 0) {
                return childChildren[0];
            }

            // If it has no children, return the next sibling
            if (i < children.length - 1) {
                return children[i + 1];
            }
            // If no next sibling at this level, traverse upward to find next item
            return findNextAtParentLevel(currentPath); // Pass currentPath since it includes `node` (parent of child)
        }

        const found = findNextItemRecursive(child, targetId, currentPath);
        if (found) return found;
    }

    return undefined;
}

// Helper function to find next item when no sibling exists at current level
function findNextAtParentLevel(path: Item[]): Item | undefined {
    // path contains ancestors up to the parent of the node we're looking from
    // Go back up the tree to find a parent with a next sibling
    for (let i = path.length - 1; i > 0; i--) {
        const currentAncestor = path[i];
        const parent = path[i - 1];

        // Get siblings of currentAncestor (children of parent)
        const siblings = collectChildren(parent);
        const index = siblings.findIndex(item => item.id === currentAncestor.id);

        if (index !== -1 && index < siblings.length - 1) {
            // Return the next sibling
            return siblings[index + 1];
        }
        // If no more siblings at this level, continue up the tree
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
