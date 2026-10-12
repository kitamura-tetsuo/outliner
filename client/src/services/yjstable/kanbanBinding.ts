import type * as Y from "yjs";

export interface KanbanPlacementItem {
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

function nodeOf(item: KanbanPlacementItem): Y.Map<unknown> | undefined {
    return item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown> | undefined;
}

export function getItemKanbanId(item: KanbanPlacementItem): string | undefined {
    const value = nodeOf(item)?.get("kanbanId");
    return typeof value === "string" && value ? value : undefined;
}

export function observeItemKanbanId(item: KanbanPlacementItem, changed: () => void): () => void {
    const node = nodeOf(item);
    if (!node) return () => {};
    const observer = (event: Y.YMapEvent<unknown>) => {
        if (event.keysChanged.has("kanbanId")) changed();
    };
    node.observe(observer);
    return () => node.unobserve(observer);
}
