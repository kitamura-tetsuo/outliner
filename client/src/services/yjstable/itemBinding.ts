// Binding between an outliner item and the table it embeds.
//
// The item's node value (Y.Map) stores the table id under "yjsTableId". Both
// the app-schema and the leaner yjs-schema Item classes expose the same
// (ydoc, tree, key) triple, so the binding is read/written through the tree
// directly instead of depending on either class.

interface ItemLike {
    tree: {
        getNodeValueFromKey: (key: string) => unknown;
    };
    key: string;
}

const TABLE_ID_FIELD = "yjsTableId";

function nodeValue(item: ItemLike): { get?: (k: string) => unknown; set?: (k: string, v: unknown) => void; } | undefined {
    try {
        return item.tree.getNodeValueFromKey(item.key) as {
            get?: (k: string) => unknown;
            set?: (k: string, v: unknown) => void;
        };
    } catch {
        return undefined;
    }
}

export function getItemTableId(item: ItemLike): string | undefined {
    const value = nodeValue(item)?.get?.(TABLE_ID_FIELD);
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function setItemTableId(item: ItemLike, tableId: string | undefined): void {
    nodeValue(item)?.set?.(TABLE_ID_FIELD, tableId);
}

interface ObservableMap {
    observe?: (f: (event: { keysChanged?: Set<string>; }) => void) => void;
    unobserve?: (f: (event: { keysChanged?: Set<string>; }) => void) => void;
}

/**
 * Watch the item's node value for binding changes (e.g. another client
 * attached a table to this item). Returns an unsubscribe function.
 */
export function observeItemTableId(item: ItemLike, onChange: () => void): () => void {
    const value = nodeValue(item) as ObservableMap | undefined;
    if (!value?.observe || !value.unobserve) return () => {};
    const handler = (event: { keysChanged?: Set<string>; }) => {
        if (!event.keysChanged || event.keysChanged.has(TABLE_ID_FIELD)) onChange();
    };
    value.observe(handler);
    return () => value.unobserve?.(handler);
}
