import type { YTree } from "yjs-orderedtree";

export function safeGetNodeParent(tree: YTree | undefined | null, key: string | undefined | null): string | undefined {
    if (!tree || typeof tree.getNodeParentFromKey !== "function" || !key || key === "root") {
        return undefined;
    }
    try {
        return tree.getNodeParentFromKey(key) || undefined;
    } catch (_e) {
        return undefined;
    }
}
