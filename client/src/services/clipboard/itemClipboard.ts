import type { CalendarSettings } from "../calendar/calendarService";
import { LAYOUT_COLUMN_COUNT, LAYOUT_COMPONENT_TYPE, normalizeColumnSpan } from "../layout/layoutModel";
export const OUTLINER_ITEMS_MIME = "application/x-outliner-items";
const OUTLINER_ITEMS_HTML_ATTRIBUTE = "data-outliner-items";

export type ClipboardComponentType = "yjstable" | "calendar" | typeof LAYOUT_COMPONENT_TYPE;

export interface ClipboardItem {
    text: string;
    depth: number;
    componentType?: ClipboardComponentType;
    /**
     * The source Table id on the copying end. On paste it drives the
     * destination Table lookup/clone; the receiver binds the newly pasted
     * outline item to a fresh Grid via `yjsGridId`.
     */
    yjsTableId?: string;
    /**
     * The Grid id on the copying end (present only when the source outline
     * item was already Grid-bound). On paste it is remapped to the freshly
     * created Grid id in the destination project.
     */
    yjsGridId?: string;
    calendarId?: string;
    /**
     * Width inside a Layout container (#4997). Carried per item so a copied
     * Layout pastes with its arrangement intact; the children's order is the
     * clipboard's own item order, exactly as the tree stores it.
     */
    columnSpan?: number;
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
    operation?: "cut";
}

export interface ItemClipboardPayloadV2 {
    version: 2;
    sourceProjectId: string;
    items: ClipboardItem[];
    operation?: "cut";
    /** Deduplicated by source table id. */
    tables: Record<string, GridTableSnapshot>;
}

export interface ItemClipboardPayloadV3 {
    version: 3;
    sourceProjectId: string;
    items: ClipboardItem[];
    operation?: "cut";
    tables?: Record<string, GridTableSnapshot>;
    calendars?: Record<string, CalendarSettings>;
}

export type ItemClipboardPayload = ItemClipboardPayloadV1 | ItemClipboardPayloadV2 | ItemClipboardPayloadV3;

interface ItemLike {
    text?: unknown;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

const bindings = {
    yjstable: "yjsTableId",
    calendar: "calendarId",
} as const;

const PAYLOAD_V1_KEYS = new Set(["version", "sourceProjectId", "items", "operation"]);
const PAYLOAD_V2_KEYS = new Set(["version", "sourceProjectId", "items", "tables", "operation"]);
const PAYLOAD_V3_KEYS = new Set(["version", "sourceProjectId", "items", "tables", "calendars", "operation"]);
const CALENDAR_SETTINGS_KEYS = new Set([
    "name",
    "query",
    "viewType",
    "timezone",
    "roleTitle",
    "roleStart",
    "roleAllDay",
    "roleDuration",
    "roleDue",
    "groupAxes",
    "laneOrder",
    "showEmptyLanes",
    "weekStart",
    "workingHoursStartMinutes",
    "workingHoursEndMinutes",
    "ganttScale",
]);
const ITEM_KEYS = new Set(["text", "depth", "componentType", "yjsTableId", "yjsGridId", "calendarId", "columnSpan"]);
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
    if (
        value.columnSpan !== undefined
        && (!Number.isInteger(value.columnSpan) || (value.columnSpan as number) < 1
            || (value.columnSpan as number) > LAYOUT_COLUMN_COUNT)
    ) {
        return false;
    }

    if (value.componentType === undefined) {
        return value.yjsTableId === undefined && value.calendarId === undefined;
    }
    // A Layout carries no binding of its own: it owns ordinary tree children,
    // which travel as the following, deeper clipboard items.
    if (value.componentType === LAYOUT_COMPONENT_TYPE) {
        return value.yjsTableId === undefined && value.calendarId === undefined;
    }
    if (value.componentType === "yjstable") {
        // yjsTableId is the required identity (used to resolve/clone the
        // source Table on paste). yjsGridId is optional — new payloads carry
        // it so the paste can rewire the outline item to a fresh Grid.
        return typeof value.yjsTableId === "string" && value.yjsTableId.length > 0
            && (value.yjsGridId === undefined
                || (typeof value.yjsGridId === "string" && value.yjsGridId.length > 0))
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

function isCalendarSettings(value: unknown): value is CalendarSettings {
    if (!isRecord(value) || !hasOnlyKeys(value, CALENDAR_SETTINGS_KEYS)) return false;
    if (typeof value.name !== "string" || typeof value.query !== "string" || typeof value.viewType !== "string") {
        return false;
    }
    if (value.timezone !== undefined && typeof value.timezone !== "string") return false;
    if (value.roleTitle !== undefined && typeof value.roleTitle !== "string") return false;
    if (value.roleStart !== undefined && typeof value.roleStart !== "string") return false;
    if (value.roleAllDay !== undefined && typeof value.roleAllDay !== "string") return false;
    if (value.roleDuration !== undefined && typeof value.roleDuration !== "string") return false;
    if (value.roleDue !== undefined && typeof value.roleDue !== "string") return false;
    if (!Array.isArray(value.groupAxes) || !value.groupAxes.every(v => typeof v === "string")) return false;
    if (!Array.isArray(value.laneOrder) || !value.laneOrder.every(v => typeof v === "string")) return false;
    if (value.showEmptyLanes !== undefined && typeof value.showEmptyLanes !== "boolean") return false;
    if (value.weekStart !== undefined && typeof value.weekStart !== "number") return false;
    if (value.workingHoursStartMinutes !== undefined && typeof value.workingHoursStartMinutes !== "number") {
        return false;
    }
    if (value.workingHoursEndMinutes !== undefined && typeof value.workingHoursEndMinutes !== "number") return false;
    if (value.ganttScale !== undefined && typeof value.ganttScale !== "string") return false;
    return true;
}

function isCalendarSettingsMap(value: unknown): value is Record<string, CalendarSettings> {
    return isRecord(value)
        && Object.entries(value).every(([calendarId, settings]) =>
            calendarId.length > 0 && isCalendarSettings(settings)
        );
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
    calendars?: Readonly<Record<string, CalendarSettings>>,
    operation?: "cut",
): string {
    const serialized = items.map(({ item, depth, fallbackText, text: textOverride }) => {
        const value = nodeValue(item);
        const rawType = value?.get?.("componentType");
        const isBoundComponent = rawType === "yjstable" || rawType === "calendar";
        const componentType = isBoundComponent || rawType === LAYOUT_COMPONENT_TYPE ? rawType : undefined;
        const bindingField = isBoundComponent ? bindings[rawType] : undefined;
        const binding = bindingField ? value?.get?.(bindingField) : undefined;
        // A yjstable host also carries its Grid id so a cross-project paste can
        // rebind the pasted item to the freshly created Grid (Grid owns the
        // SELECT + presentation). The Table id stays the required identity used
        // to resolve/clone the source relation.
        const rawGridId = rawType === "yjstable" ? value?.get?.("yjsGridId") : undefined;
        const gridId = typeof rawGridId === "string" && rawGridId.length > 0 ? rawGridId : undefined;
        const rawSpan = value?.get?.("columnSpan");
        // Repaired on the way out, by the same rule rendering uses, so a broken
        // stored span cannot travel to another document.
        const columnSpan = typeof rawSpan === "number" && Number.isFinite(rawSpan)
            ? normalizeColumnSpan(rawSpan)
            : undefined;
        const text = (textOverride ?? String(item.text ?? "")) || fallbackText || "";
        const carriesComponent = componentType === LAYOUT_COMPONENT_TYPE
            || (componentType !== undefined && typeof binding === "string" && binding.length > 0);
        return {
            text,
            depth,
            ...(carriesComponent
                ? (bindingField ? { componentType, [bindingField]: binding } : { componentType })
                : {}),
            ...(carriesComponent && gridId !== undefined ? { yjsGridId: gridId } : {}),
            ...(carriesComponent && columnSpan !== undefined ? { columnSpan } : {}),
        } as ClipboardItem;
    });

    if (!serialized.every(isClipboardItem)) throw new TypeError("Cannot serialize invalid clipboard items");
    if (tables === undefined && calendars === undefined) {
        return JSON.stringify(
            {
                version: 1,
                sourceProjectId,
                items: serialized,
                ...(operation ? { operation } : {}),
            } satisfies ItemClipboardPayloadV1,
        );
    }

    if (calendars === undefined) {
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
                ...(operation ? { operation } : {}),
            } satisfies ItemClipboardPayloadV2,
        );
    }

    const snapshotMap = tables ? { ...tables } : undefined;
    if (snapshotMap && !isSnapshotMap(snapshotMap)) {
        throw new TypeError("Cannot serialize invalid Grid table snapshots");
    }
    const calendarMap = calendars ? { ...calendars } : undefined;
    if (calendarMap && !isCalendarSettingsMap(calendarMap)) {
        throw new TypeError("Cannot serialize invalid calendar settings");
    }
    return JSON.stringify(
        {
            version: 3,
            sourceProjectId,
            items: serialized,
            ...(snapshotMap ? { tables: snapshotMap } : {}),
            ...(calendarMap ? { calendars: calendarMap } : {}),
            ...(operation ? { operation } : {}),
        } satisfies ItemClipboardPayloadV3,
    );
}

export function deserializeClipboardItems(value: string): ItemClipboardPayload | undefined {
    try {
        const payload: unknown = JSON.parse(value);
        if (
            !isRecord(payload)
            || typeof payload.sourceProjectId !== "string" || !Array.isArray(payload.items)
            || (payload.operation !== undefined && payload.operation !== "cut")
        ) {
            return undefined;
        }
        if (!payload.items.every(isClipboardItem)) return undefined;
        if (payload.version === 1) {
            if (!hasOnlyKeys(payload, PAYLOAD_V1_KEYS)) return undefined;
            return payload as unknown as ItemClipboardPayloadV1;
        }
        if (payload.version === 2) {
            if (!hasOnlyKeys(payload, PAYLOAD_V2_KEYS)) return undefined;
            if (!isSnapshotMap(payload.tables)) return undefined;
            return payload as unknown as ItemClipboardPayloadV2;
        }
        if (payload.version === 3) {
            if (!hasOnlyKeys(payload, PAYLOAD_V3_KEYS)) return undefined;
            if (payload.tables !== undefined && !isSnapshotMap(payload.tables)) return undefined;
            if (payload.calendars !== undefined && !isCalendarSettingsMap(payload.calendars)) return undefined;
            return payload as unknown as ItemClipboardPayloadV3;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

export function clipboardPlainText(payload: ItemClipboardPayload): string {
    return payload.items.map(item => item.text).join("\n");
}

/**
 * The clipboard's HTML fragment: the private payload in a hidden span, followed
 * by what another application renders. `renderedHtml` overrides that visible
 * part — a Grid supplies a real `<table>` there — and the hidden span is
 * untouched either way, so in-app paste fidelity does not depend on it.
 */
export function structuredClipboardHtml(encoded: string, plainText: string, renderedHtml?: string): string {
    const bytes = new TextEncoder().encode(encoded);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const visibleHtml = renderedHtml !== undefined
        ? renderedHtml
        : plainText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
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
