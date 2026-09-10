// Binding between an outliner item (a Diagram transclusion) and the Diagram
// it renders. Mirrors calendarBinding.ts exactly: the item's node value
// (Y.Map) stores the Diagram id under "diagramId", read/written through the
// tree directly rather than through the `Item` class, so both the app-schema
// and any lighter-weight Item-like wrapper can share it.

interface ItemLike {
    tree: {
        getNodeValueFromKey: (key: string) => unknown;
    };
    key: string;
}

const DIAGRAM_ID_FIELD = "diagramId";

function nodeValue(
    item: ItemLike,
): { get?: (k: string) => unknown; set?: (k: string, v: unknown) => void; } | undefined {
    try {
        return item.tree.getNodeValueFromKey(item.key) as {
            get?: (k: string) => unknown;
            set?: (k: string, v: unknown) => void;
        };
    } catch {
        return undefined;
    }
}

export function getItemDiagramId(item: ItemLike): string | undefined {
    const value = nodeValue(item)?.get?.(DIAGRAM_ID_FIELD);
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function setItemDiagramId(item: ItemLike, diagramId: string | undefined): void {
    nodeValue(item)?.set?.(DIAGRAM_ID_FIELD, diagramId);
}

interface ObservableMap {
    observe?: (f: (event: { keysChanged?: Set<string>; }) => void) => void;
    unobserve?: (f: (event: { keysChanged?: Set<string>; }) => void) => void;
}

/**
 * Watch the item's node value for binding changes (e.g. another client
 * inserted a different transclusion at this position). Returns an
 * unsubscribe function.
 */
export function observeItemDiagramId(item: ItemLike, onChange: () => void): () => void {
    const value = nodeValue(item) as ObservableMap | undefined;
    if (!value?.observe || !value.unobserve) return () => {};
    const handler = (event: { keysChanged?: Set<string>; }) => {
        if (!event.keysChanged || event.keysChanged.has(DIAGRAM_ID_FIELD)) onChange();
    };
    value.observe(handler);
    return () => value.unobserve?.(handler);
}
