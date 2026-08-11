export const OUTLINER_ITEMS_MIME = "application/x-outliner-items";
const OUTLINER_ITEMS_HTML_ATTRIBUTE = "data-outliner-items";

export type ClipboardComponentType = "yjstable" | "calendar";

export interface ClipboardItem {
    text: string;
    depth: number;
    componentType?: ClipboardComponentType;
    yjsTableId?: string;
    calendarId?: string;
}

export interface GridUiComponentDto {
    type?: "text" | "number" | "checkbox" | "select" | "date";
    label?: string;
    hidden?: boolean;
}

/** Portable form of the Grid UI Definition currently persisted in Yjs. */
export interface GridUiDefinitionDto {
    query: string;
    components: Record<string, GridUiComponentDto>;
    columnOrder: string[];
}

/** Structure-only table snapshot. Data Storage and Yjs identities are deliberately absent. */
export interface GridTableSnapshot {
    sourceTableId: string;
    name: string;
    sqlName: string;
    schemaSql: string;
    ui: GridUiDefinitionDto;
}

export interface ItemClipboardPayloadV1 {
    version: 1;
    sourceProjectId: string;
    items: ClipboardItem[];
}

export interface ItemClipboardPayloadV2 {
    version: 2;
    sourceProjectId: string;
    items: ClipboardItem[];
    /** Deduplicated by source table id. */
    tables: Record<string, GridTableSnapshot>;
}

export type ItemClipboardPayload = ItemClipboardPayloadV1 | ItemClipboardPayloadV2;

interface ItemLike {
    text?: unknown;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

const bindings = {
    yjstable: "yjsTableId",
    calendar: "calendarId",
} as const;

const ITEM_KEYS = new Set(["text", "depth", "componentType", "yjsTableId", "calendarId"]);
const SNAPSHOT_KEYS = new Set(["sourceTableId", "name", "sqlName", "schemaSql", "ui"]);
const UI_KEYS = new Set(["query", "components", "columnOrder"]);
const COMPONENT_KEYS = new Set(["type", "label", "hidden"]);
const CELL_COMPONENT_TYPES = new Set(["text", "number", "checkbox", "select", "date"]);

function nodeValue(item: ItemLike): { get?: (key: string) => unknown; } | undefined {
    try {
        return item.tree.getNodeValueFromKey(item.key) as { get?: (key: string) => unknown; };
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
    return Object.keys(value).every(key => allowed.has(key));
}

function isClipboardItem(value: unknown): value is ClipboardItem {
    if (!isRecord(value) || !hasOnlyKeys(value, ITEM_KEYS)) return false;
    if (typeof value.text !== "string" || !Number.isInteger(value.depth) || (value.depth as number) < 0) return false;

    if (value.componentType === undefined) {
        return value.yjsTableId === undefined && value.calendarId === undefined;
    }
    if (value.componentType === "yjstable") {
        return typeof value.yjsTableId === "string" && value.yjsTableId.length > 0
            && value.calendarId === undefined;
    }
    if (value.componentType === "calendar") {
        return typeof value.calendarId === "string" && value.calendarId.length > 0
            && value.yjsTableId === undefined;
    }
    return false;
}

function isGridUiComponentDto(value: unknown): value is GridUiComponentDto {
    if (!isRecord(value) || !hasOnlyKeys(value, COMPONENT_KEYS)) return false;
    if (value.type !== undefined && (typeof value.type !== "string" || !CELL_COMPONENT_TYPES.has(value.type))) {
        return false;
    }
    if (value.label !== undefined && typeof value.label !== "string") return false;
    if (value.hidden !== undefined && typeof value.hidden !== "boolean") return false;
    return true;
}

export function isGridUiDefinitionDto(value: unknown): value is GridUiDefinitionDto {
    if (!isRecord(value) || !hasOnlyKeys(value, UI_KEYS)) return false;
    if (typeof value.query !== "string" || !isRecord(value.components) || !Array.isArray(value.columnOrder)) {
        return false;
    }
    if (
        !Object.entries(value.components).every(([column, config]) => column.length > 0 && isGridUiComponentDto(config))
    ) {
        return false;
    }
    if (!value.columnOrder.every(column => typeof column === "string" && column.length > 0)) return false;
    return new Set(value.columnOrder).size === value.columnOrder.length;
}

export function isGridTableSnapshot(value: unknown, sourceTableId?: string): value is GridTableSnapshot {
    if (!isRecord(value) || !hasOnlyKeys(value, SNAPSHOT_KEYS)) return false;
    if (
        typeof value.sourceTableId !== "string" || value.sourceTableId.length === 0
        || (sourceTableId !== undefined && value.sourceTableId !== sourceTableId)
        || typeof value.name !== "string"
        || typeof value.sqlName !== "string" || value.sqlName.length === 0
        || typeof value.schemaSql !== "string" || value.schemaSql.trim().length === 0
    ) {
        return false;
    }
    return isGridUiDefinitionDto(value.ui);
}

function isSnapshotMap(value: unknown): value is Record<string, GridTableSnapshot> {
    return isRecord(value)
        && Object.entries(value).every(([sourceTableId, snapshot]) =>
            sourceTableId.length > 0 && isGridTableSnapshot(snapshot, sourceTableId)
        );
}

export function serializeClipboardItems(
    sourceProjectId: string,
    // `text` overrides the item's own text, so a partially selected item can be
    // copied as just the selected slice while keeping its position in the range.
    items: Array<{ item: ItemLike; depth: number; fallbackText?: string; text?: string; }>,
    tables?: Readonly<Record<string, GridTableSnapshot>>,
): string {
    const serialized = items.map(({ item, depth, fallbackText, text: textOverride }) => {
        const value = nodeValue(item);
        const rawType = value?.get?.("componentType");
        const componentType = rawType === "yjstable" || rawType === "calendar" ? rawType : undefined;
        const bindingField = componentType ? bindings[componentType] : undefined;
        const binding = bindingField ? value?.get?.(bindingField) : undefined;
        const text = (textOverride ?? String(item.text ?? "")) || fallbackText || "";
        return {
            text,
            depth,
            ...(componentType && typeof binding === "string" && binding.length > 0
                ? { componentType, [bindingField!]: binding }
                : {}),
        } as ClipboardItem;
    });

    if (!serialized.every(isClipboardItem)) throw new TypeError("Cannot serialize invalid clipboard items");
    if (tables === undefined) {
        return JSON.stringify({ version: 1, sourceProjectId, items: serialized } satisfies ItemClipboardPayloadV1);
    }

    const snapshotMap = { ...tables };
    if (!isSnapshotMap(snapshotMap)) {
        throw new TypeError("Cannot serialize invalid Grid table snapshots");
    }
    return JSON.stringify(
        {
            version: 2,
            sourceProjectId,
            items: serialized,
            tables: snapshotMap,
        } satisfies ItemClipboardPayloadV2,
    );
}

export function deserializeClipboardItems(value: string): ItemClipboardPayload | undefined {
    try {
        const payload: unknown = JSON.parse(value);
        if (!isRecord(payload) || typeof payload.sourceProjectId !== "string" || !Array.isArray(payload.items)) {
            return undefined;
        }
        if (!payload.items.every(isClipboardItem)) return undefined;
        if (payload.version === 1) {
            if (!hasOnlyKeys(payload, new Set(["version", "sourceProjectId", "items"]))) return undefined;
            return payload as unknown as ItemClipboardPayloadV1;
        }
        if (payload.version === 2) {
            if (!hasOnlyKeys(payload, new Set(["version", "sourceProjectId", "items", "tables"]))) return undefined;
            if (!isSnapshotMap(payload.tables)) return undefined;
            return payload as unknown as ItemClipboardPayloadV2;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

export function clipboardPlainText(payload: ItemClipboardPayload): string {
    return payload.items.map(item => item.text).join("\n");
}

export function structuredClipboardHtml(encoded: string, plainText: string, customHtml?: string): string {
    const bytes = new TextEncoder().encode(encoded);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const visibleHtml = customHtml !== undefined ? customHtml : plainText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("\n", "<br>");
    return `<span ${OUTLINER_ITEMS_HTML_ATTRIBUTE}="${btoa(binary)}" hidden></span><span>${visibleHtml}</span>`;
}

export function structuredClipboardFromHtml(html: string): string | undefined {
    if (!html) return undefined;
    const document = new DOMParser().parseFromString(html, "text/html");
    const encoded = document.querySelector(`[${OUTLINER_ITEMS_HTML_ATTRIBUTE}]`)?.getAttribute(
        OUTLINER_ITEMS_HTML_ATTRIBUTE,
    );
    if (!encoded) return undefined;
    try {
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return undefined;
    }
}
