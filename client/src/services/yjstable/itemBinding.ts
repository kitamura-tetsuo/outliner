// Binding between an outliner item and the Grid it embeds.
//
// The item's node value (Y.Map) stores its independent Grid id under
// "yjsGridId". The Grid owns its query and presentation; completed SQL evidence
// identifies its dependencies and physical write sources.
//
// Both the app-schema and the leaner yjs-schema Item classes expose the same
// (ydoc, tree, key) triple, so the binding is read/written through the tree
// directly instead of depending on either class.

interface ItemLike {
    tree: {
        getNodeValueFromKey: (key: string) => unknown;
    };
    key: string;
}

const GRID_ID_FIELD = "yjsGridId";

function nodeValue(
    item: ItemLike,
): { get?: (k: string) => unknown; set?: (k: string, v: unknown) => void; delete?: (k: string) => void; } | undefined {
    try {
        return item.tree.getNodeValueFromKey(item.key) as {
            get?: (k: string) => unknown;
            set?: (k: string, v: unknown) => void;
            delete?: (k: string) => void;
        };
    } catch {
        return undefined;
    }
}

export function getItemGridId(item: ItemLike): string | undefined {
    const value = nodeValue(item)?.get?.(GRID_ID_FIELD);
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function setItemGridId(item: ItemLike, gridId: string | undefined): void {
    nodeValue(item)?.set?.(GRID_ID_FIELD, gridId);
}

/**
 * Bind an item to its independent Grid identity. Grid rendering and
 * mutation authority use the live Grid binding and completed SQL evidence.
 */
export function bindItemToGrid(
    item: ItemLike,
    gridId: string | undefined,
): void {
    const value = nodeValue(item);
    value?.set?.(GRID_ID_FIELD, gridId);
}

interface ObservableMap {
    observe?: (f: (event: { keysChanged?: Set<string>; }) => void) => void;
    unobserve?: (f: (event: { keysChanged?: Set<string>; }) => void) => void;
}

/**
 * Watch the item's node value for binding changes (e.g. another client
 * attached a Grid to this item). Returns an unsubscribe function.
 */
export function observeItemGridId(item: ItemLike, onChange: () => void): () => void {
    const value = nodeValue(item) as ObservableMap | undefined;
    if (!value?.observe || !value.unobserve) return () => {};
    const handler = (event: { keysChanged?: Set<string>; }) => {
        if (
            !event.keysChanged
            || event.keysChanged.has(GRID_ID_FIELD)
        ) onChange();
    };
    value.observe(handler);
    return () => value.unobserve?.(handler);
}
