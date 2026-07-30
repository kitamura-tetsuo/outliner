// Binding between an outliner item and the calendar it embeds.
//
// The item's node value (Y.Map) stores the calendar id under "calendarId".
// Mirrors itemBinding.ts (the equivalent for "yjsTableId") exactly: both the
// app-schema and the leaner yjs-schema Item classes expose the same
// (ydoc, tree, key) triple, so the binding is read/written through the tree
// directly instead of depending on either class. Unlike a table, a calendar
// has no subdoc of its own — the id is a plain lookup key into the project's
// `calendars` map (docs/crdt-sql-architecture.md §6.6).

interface ItemLike {
    tree: {
        getNodeValueFromKey: (key: string) => unknown;
    };
    key: string;
}

const CALENDAR_ID_FIELD = "calendarId";

function nodeValue(
    item: ItemLike,
): { get?: (k: string) => unknown; set?: (k: string, v: unknown) => void; } | undefined {
    try {
        return item.tree.getNodeValueFromKey(item.key) as {
            get?: (k: string) => unknown;
            set?: (k: string, v: unknown) => void;
        };
    } catch (_e) {
        return undefined;
    }
}

export function getItemCalendarId(item: ItemLike): string | undefined {
    const value = nodeValue(item)?.get?.(CALENDAR_ID_FIELD);
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function setItemCalendarId(item: ItemLike, calendarId: string | undefined): void {
    nodeValue(item)?.set?.(CALENDAR_ID_FIELD, calendarId);
}

interface ObservableMap {
    observe?: (f: (event: { keysChanged?: Set<string>; }) => void) => void;
    unobserve?: (f: (event: { keysChanged?: Set<string>; }) => void) => void;
}

/**
 * Watch the item's node value for binding changes (e.g. another client
 * attached a calendar to this item). Returns an unsubscribe function.
 */
export function observeItemCalendarId(item: ItemLike, onChange: () => void): () => void {
    const value = nodeValue(item) as ObservableMap | undefined;
    if (!value?.observe || !value.unobserve) return () => {};
    const handler = (event: { keysChanged?: Set<string>; }) => {
        if (!event.keysChanged || event.keysChanged.has(CALENDAR_ID_FIELD)) onChange();
    };
    value.observe(handler);
    return () => value.unobserve?.(handler);
}
