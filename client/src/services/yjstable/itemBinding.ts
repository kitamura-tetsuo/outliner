// Binding between an outliner item and the Grid it embeds.
//
// The item's node value (Y.Map) stores the Grid id under "yjsGridId". A Grid
// definition in turn references a source Table (via its `sourceTableId`), so
// the item -> Grid -> Table chain replaces the old direct item -> Table
// binding: several Grids can now share the same Table without duplicating it.
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
// Legacy field name from the pre-Grid model. Kept only so old node values that
// still expose it can be observed and cleared; nothing new writes it.
const LEGACY_TABLE_ID_FIELD = "yjsTableId";

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

export function getItemGridId(item: ItemLike): string | undefined {
    const value = nodeValue(item)?.get?.(GRID_ID_FIELD);
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function setItemGridId(item: ItemLike, gridId: string | undefined): void {
    nodeValue(item)?.set?.(GRID_ID_FIELD, gridId);
}

/**
 * Bind an item to a Grid and record its source Table id at the same time.
 *
 * `yjsGridId` is the authoritative binding the mounted view reads; `yjsTableId`
 * is kept in lockstep as provenance so the Table-keyed clipboard/export/cut
 * pipeline keeps recognizing the block as a component. Passing `undefined`
 * clears both fields (detach).
 */
export function bindItemToGrid(
    item: ItemLike,
    gridId: string | undefined,
    sourceTableId: string | undefined,
): void {
    const value = nodeValue(item);
    value?.set?.(GRID_ID_FIELD, gridId);
    value?.set?.(LEGACY_TABLE_ID_FIELD, gridId ? sourceTableId : undefined);
}

/**
 * Legacy accessor: prior versions bound items directly to a table. Callers that
 * still need to know whether an item carries the old field can inspect it here,
 * but new code should read/write `gridId` instead.
 */
export function getItemLegacyTableId(item: ItemLike): string | undefined {
    const value = nodeValue(item)?.get?.(LEGACY_TABLE_ID_FIELD);
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Legacy alias for {@link getItemLegacyTableId}. Kept so callers that identify a
 * host by its source Table id (clipboard export, cut/detach) keep compiling
 * during the Grid split. Prefer {@link getItemGridId} on read paths.
 */
export const getItemTableId = getItemLegacyTableId;

/**
 * Legacy setter for the `yjsTableId` field. Retained so cut/detach paths that
 * clear the field with `setItemTableId(item, undefined)` keep working. New code
 * should call {@link setItemGridId}.
 */
export function setItemTableId(item: ItemLike, tableId: string | undefined): void {
    nodeValue(item)?.set?.(LEGACY_TABLE_ID_FIELD, tableId);
}

/**
 * Legacy alias: watch the item for either grid-id or table-id changes. Old
 * callsites use `observeItemTableId`; new code should call
 * {@link observeItemGridId}. Both notify on either field.
 */
export const observeItemTableId = observeItemGridId;

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
            || event.keysChanged.has(LEGACY_TABLE_ID_FIELD)
        ) onChange();
    };
    value.observe(handler);
    return () => value.unobserve?.(handler);
}
