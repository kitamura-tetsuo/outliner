export function safeGetNodeParent(tree: any, key: string | undefined | null): string | undefined {
    if (!tree || typeof tree.getNodeParentFromKey !== "function" || !key || key === "root") {
        return undefined;
    }
    try {
        return tree.getNodeParentFromKey(key);
    } catch (e) {
        return undefined;
    }
}
