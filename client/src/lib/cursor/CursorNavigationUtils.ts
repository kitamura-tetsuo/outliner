import type { Item } from "../../schema/app-schema";
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
    const roots = generalStore.pages.current;
    for (let i = 0; i < roots.length; i++) {
        const root = roots[i];
        if (root.id === currentItemId) {
            return i > 0 ? getDeepestDescendant(roots[i - 1]) : undefined;
        }
        if (searchItem(root, currentItemId)) {
            // Found in this root's tree
            return findPreviousItemRecursive(root, currentItemId);
        }
    }
    return undefined;
}

function findPreviousItemRecursive(node: Item, targetId: string, prevItem?: Item): Item | undefined {
    if (node.id === targetId) {
        return prevItem;
    }

    const children = collectChildren(node);
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        // When target is the first child (i === 0), don't return the parent node.
        // Instead return undefined to indicate there's no previous navigable item.
        const prevForChild = i > 0 ? getDeepestDescendant(children[i - 1]) : undefined;

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
    const roots = generalStore.pages.current;
    for (let i = 0; i < roots.length; i++) {
        const root = roots[i];
        if (root.id === currentItemId) {
            const children = collectChildren(root);
            return children.length > 0 ? children[0] : (i < roots.length - 1 ? roots[i + 1] : undefined);
        }

        if (searchItem(root, currentItemId)) {
            const next = findNextItemRecursive(root, currentItemId, []);
            if (next) return next;
            // If satisfied in subtree but returned undefined (end of subtree), go to next root
            return i < roots.length - 1 ? roots[i + 1] : undefined;
        }
    }
    return undefined;
}

function findNextItemRecursive(node: Item, targetId: string, path: Item[]): Item | undefined {
    const children = collectChildren(node);
    const currentPath = [...path, node];

    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child.id === targetId) {
            // If this child is the target, return the next sibling if it exists
            if (i < children.length - 1) {
                return children[i + 1];
            }
            // If no next sibling at this level, traverse upward to find next item
            // Fixed: was passing currentPath instead of path
            return findNextAtParentLevel(path);
        }

        const found = findNextItemRecursive(child, targetId, currentPath);
        if (found) return found;
    }

    return undefined;
}

// Helper function to find next item when no sibling exists at current level
function findNextAtParentLevel(path: Item[]): Item | undefined {
    // Go back up the tree to find a parent with a next sibling
    for (let i = path.length - 1; i >= 0; i--) {
        const currentAncestor = path[i];

        // If i === 0, we're at the root level and can't go higher
        if (i === 0) {
            return undefined;
        }

        // Get the parent (previous item in path)
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
