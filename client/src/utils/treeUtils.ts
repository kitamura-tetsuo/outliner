import type { YTree } from "yjs-orderedtree";

/**
 * Safely gets the parent key of a node from the YTree.
 * yjs-orderedtree's getNodeParentFromKey throws an error if the node doesn't exist
 * or if it tries to access the parent of a root node (where parent is null).
 * This utility catches those errors and returns undefined instead.
 */
export function safeGetNodeParent(
    tree: YTree | { getNodeParentFromKey?: (key: string) => string | undefined; },
    key: string,
): string | undefined {
    if (key === "root") return undefined;
    if (!tree || typeof tree.getNodeParentFromKey !== "function") return undefined;

    try {
        const parent = tree.getNodeParentFromKey(key);
        return parent;
    } catch (e) {
        return undefined;
    }
}
