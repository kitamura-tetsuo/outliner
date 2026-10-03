// Framework-neutral Yjs writers and readers for one Grid definition.
//
// A Grid definition is an entry of the project document's `yjsGrids` registry
// (see client/src/services/yjstable/gridDocs.ts for the full data model). These
// functions are the browser's normal Grid creation/editing operations; they
// live here, free of Svelte and undo-router state, so the server and its
// regression tests use the exact same code as the client instead of a copy.
//
// Every writer touches only its own key (or its own nested component leaf), so
// concurrent edits to different fields of the same Grid merge cleanly.

import * as Y from "yjs";
import { EXPLICIT_SELECT_ALIAS_POLICY_VERSION, validateExplicitSelectAliases } from "./explicitSelectAlias.js";

export const GRID_REGISTRY_KEY = "yjsGrids";

/**
 * The structural part of a Grid's handles every writer needs. The client's
 * `GridHandles` (which also carries an undo manager) satisfies it.
 */
export interface GridDefinitionTarget {
    /** The project doc this Grid belongs to. */
    projectDoc: Y.Doc;
    /** The registry Y.Map entry. */
    entry: Y.Map<unknown>;
    /** The nested map of per-column UI settings (Y.Map<column, Y.Map<{type,label,hidden,widthPx}>>). */
    components: Y.Map<Y.Map<unknown>>;
}

export interface GridDefinitionSeed {
    name?: string;
    query?: string;
    columnOrder?: string[];
    /** Optional seed per column (label/type/hidden/widthPx). */
    components?: Record<string, { type?: string; label?: string; hidden?: boolean; widthPx?: number; }>;
    /** Defaults to true. Setting to false explicitly disables the Add row button. */
    showAddRowButton?: boolean;
    /** Defaults to false. Setting to true requires confirmation to delete a row. */
    confirmRowDelete?: boolean;
}

/**
 * Saved per-column width overrides are whole column border-box widths in CSS
 * px. Valid widths are finite integers in the inclusive range 32..4096; the
 * absence of an override means automatic sizing, never zero or a saved
 * default.
 */
export const GRID_COLUMN_WIDTH_MIN = 32;
export const GRID_COLUMN_WIDTH_MAX = 4096;

/** Whether `value` is a storable per-column width override. */
export function isValidGridColumnWidth(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value)
        && value >= GRID_COLUMN_WIDTH_MIN && value <= GRID_COLUMN_WIDTH_MAX;
}

export function getGridRegistry(projectDoc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return projectDoc.getMap<Y.Map<unknown>>(GRID_REGISTRY_KEY);
}

/**
 * Add one complete Grid entry to the registry under `gridId`. All
 * initialization happens in one transaction so observers never see a
 * partially populated Grid.
 */
export function createGridEntry(
    projectDoc: Y.Doc,
    gridId: string,
    sourceTableId: string,
    options: GridDefinitionSeed = {},
): void {
    if (options.query?.trim()) validateExplicitSelectAliases(options.query);
    // Every supplied width is validated before the operation has any effect:
    // an invalid seed rejects the whole creation rather than coercing,
    // truncating, or partially seeding the Grid.
    for (const [column, cfg] of Object.entries(options.components ?? {})) {
        if (cfg.widthPx !== undefined && !isValidGridColumnWidth(cfg.widthPx)) {
            throw new Error(
                `Invalid widthPx for column "${column}": expected a finite integer in `
                    + `the range ${GRID_COLUMN_WIDTH_MIN}..${GRID_COLUMN_WIDTH_MAX}`,
            );
        }
    }
    projectDoc.transact(() => {
        const entry = new Y.Map<unknown>();
        entry.set("sourceTableId", sourceTableId);
        entry.set("name", options.name ?? "Grid");
        if (options.query !== undefined) {
            entry.set("query", options.query);
            if (options.query.trim()) entry.set("sqlAliasPolicyVersion", EXPLICIT_SELECT_ALIAS_POLICY_VERSION);
        }
        if (options.columnOrder && options.columnOrder.length > 0) {
            entry.set("columnOrder", [...options.columnOrder]);
        }
        if (options.showAddRowButton === false) {
            entry.set("showAddRowButton", false);
        }
        if (options.confirmRowDelete === true) {
            entry.set("confirmRowDelete", true);
        }
        const components = new Y.Map<Y.Map<unknown>>();
        for (const [column, cfg] of Object.entries(options.components ?? {})) {
            const componentEntry = new Y.Map<unknown>();
            if (cfg.type !== undefined) componentEntry.set("type", cfg.type);
            if (cfg.label !== undefined) componentEntry.set("label", cfg.label);
            if (cfg.hidden !== undefined) componentEntry.set("hidden", cfg.hidden);
            if (cfg.widthPx !== undefined) componentEntry.set("widthPx", cfg.widthPx);
            components.set(column, componentEntry);
        }
        entry.set("components", components);
        getGridRegistry(projectDoc).set(gridId, entry);
    });
}

/** Resolve a Grid's writer target, creating its components map when absent. */
export function getGridDefinitionTarget(projectDoc: Y.Doc, gridId: string): GridDefinitionTarget | undefined {
    const entry = getGridRegistry(projectDoc).get(gridId);
    if (!entry) return undefined;
    let components = entry.get("components");
    if (!(components instanceof Y.Map)) {
        components = new Y.Map<Y.Map<unknown>>();
        entry.set("components", components);
    }
    return { projectDoc, entry, components: components as Y.Map<Y.Map<unknown>> };
}

export function renameGrid(projectDoc: Y.Doc, gridId: string, name: string): void {
    getGridRegistry(projectDoc).get(gridId)?.set("name", name);
}

export function getGridQuery(target: Pick<GridDefinitionTarget, "entry">): string {
    return String(target.entry.get("query") ?? "");
}

/** Replace the SELECT query text. */
export function setGridQuery(target: GridDefinitionTarget, query: string): void {
    if (query === getGridQuery(target)) return;
    validateExplicitSelectAliases(query);
    target.projectDoc.transact(() => {
        target.entry.set("query", query);
        target.entry.set("sqlAliasPolicyVersion", EXPLICIT_SELECT_ALIAS_POLICY_VERSION);
    });
}

export function getGridColumnOrder(target: Pick<GridDefinitionTarget, "entry">): string[] {
    const order = target.entry.get("columnOrder");
    if (Array.isArray(order)) return order as string[];
    if (order instanceof Y.Array) return order.toArray() as string[];
    return [];
}

export function setGridColumnOrder(target: GridDefinitionTarget, order: string[]): void {
    target.projectDoc.transact(() => {
        target.entry.set("columnOrder", [...order]);
    });
}

export function getGridShowAddRowButton(target: Pick<GridDefinitionTarget, "entry">): boolean {
    return target.entry.get("showAddRowButton") !== false;
}

export function setGridShowAddRowButton(target: GridDefinitionTarget, show: boolean): void {
    const current = getGridShowAddRowButton(target);
    if (show === current) return;
    target.projectDoc.transact(() => {
        if (show) target.entry.delete("showAddRowButton");
        else target.entry.set("showAddRowButton", false);
    });
}

export function getGridConfirmRowDelete(target: Pick<GridDefinitionTarget, "entry">): boolean {
    return target.entry.get("confirmRowDelete") === true;
}

export function setGridConfirmRowDelete(target: GridDefinitionTarget, confirm: boolean): void {
    const current = getGridConfirmRowDelete(target);
    if (confirm === current) return;
    target.projectDoc.transact(() => {
        if (confirm) target.entry.set("confirmRowDelete", true);
        else target.entry.delete("confirmRowDelete");
    });
}

/** Snapshot the per-column UI settings into a plain record for the UI mirror. */
export function readGridComponents(target: Pick<GridDefinitionTarget, "components">): {
    types: Record<string, string | undefined>;
    labels: Record<string, string | undefined>;
    hidden: Record<string, boolean>;
    widths: Record<string, number>;
} {
    // Keyed by exact result-column name, so the records have no prototype: a
    // column named "__proto__" or "constructor" is an ordinary own key, and an
    // unconfigured one never resolves to an inherited Object.prototype member.
    // Malformed stored widths read as automatic sizing (absent) without
    // modifying the stored document.
    const types: Record<string, string | undefined> = Object.create(null);
    const labels: Record<string, string | undefined> = Object.create(null);
    const hidden: Record<string, boolean> = Object.create(null);
    const widths: Record<string, number> = Object.create(null);
    target.components.forEach((cfg, column) => {
        if (!(cfg instanceof Y.Map)) return;
        const type = cfg.get("type");
        if (type !== undefined) types[column] = String(type);
        const label = cfg.get("label");
        if (label !== undefined) labels[column] = String(label);
        if (cfg.get("hidden") === true) hidden[column] = true;
        const widthPx = cfg.get("widthPx");
        if (isValidGridColumnWidth(widthPx)) widths[column] = widthPx;
    });
    return { types, labels, hidden, widths };
}

/**
 * Read one column's saved width override: a valid number, or undefined for
 * automatic sizing. Malformed stored widths read as absent without modifying
 * the stored document.
 */
export function getGridColumnWidth(
    target: Pick<GridDefinitionTarget, "components">,
    column: string,
): number | undefined {
    const cfg = target.components.get(column);
    if (!(cfg instanceof Y.Map)) return undefined;
    const widthPx = cfg.get("widthPx");
    return isValidGridColumnWidth(widthPx) ? widthPx : undefined;
}

/**
 * Set (or, with `undefined`, reset) one column's saved width override.
 *
 * The width is validated before the operation has any effect: invalid values
 * are rejected rather than coerced, truncated, or clamped. A set touches only
 * the addressed `widthPx` leaf (creating only previously absent containers);
 * a reset removes only the override and preserves every other component
 * field. Assigning the current valid value, or resetting an already-absent
 * override, performs no Yjs update at all — not even an empty-map creation.
 */
export function setGridColumnWidth(
    target: GridDefinitionTarget,
    column: string,
    widthPx: number | undefined,
): void {
    if (widthPx !== undefined && !isValidGridColumnWidth(widthPx)) {
        throw new Error(
            `Invalid widthPx for column "${column}": expected a finite integer in `
                + `the range ${GRID_COLUMN_WIDTH_MIN}..${GRID_COLUMN_WIDTH_MAX}`,
        );
    }
    const existing = target.components.get(column);
    if (widthPx === undefined) {
        if (!(existing instanceof Y.Map) || !existing.has("widthPx")) return;
        target.projectDoc.transact(() => {
            const cfg = target.components.get(column);
            if (!(cfg instanceof Y.Map)) return;
            cfg.delete("widthPx");
            if (Array.from(cfg.keys()).length === 0) target.components.delete(column);
        });
        return;
    }
    if (existing instanceof Y.Map && existing.get("widthPx") === widthPx) return;
    target.projectDoc.transact(() => {
        const current = target.components.get(column);
        const cfg = current instanceof Y.Map ? current : new Y.Map<unknown>();
        if (!(current instanceof Y.Map)) target.components.set(column, cfg);
        cfg.set("widthPx", widthPx);
    });
}

/** Set (or clear) a per-column config field. */
export function setGridComponentField(
    target: GridDefinitionTarget,
    column: string,
    field: "type" | "label" | "hidden" | "widthPx",
    value: string | boolean | number | undefined,
): void {
    // Width overrides validate like the dedicated writer and share its
    // leaf-scoped, no-op-free semantics.
    if (field === "widthPx") {
        if (value === "") {
            setGridColumnWidth(target, column, undefined);
            return;
        }
        if (value !== undefined && !isValidGridColumnWidth(value)) {
            throw new Error(
                `Invalid widthPx for column "${column}": expected a finite integer in `
                    + `the range ${GRID_COLUMN_WIDTH_MIN}..${GRID_COLUMN_WIDTH_MAX}`,
            );
        }
        setGridColumnWidth(target, column, value);
        return;
    }
    target.projectDoc.transact(() => {
        const existing = target.components.get(column);
        const cfg = existing instanceof Y.Map ? existing : new Y.Map<unknown>();
        if (!(existing instanceof Y.Map)) target.components.set(column, cfg);

        if (value === undefined || value === "") {
            cfg.delete(field);
            if (Array.from(cfg.keys()).length === 0) target.components.delete(column);
            return;
        }
        cfg.set(field, value);
    });
}

/**
 * The rendered column order: stored-order names that the query actually
 * returned, then every unmentioned result column in query-result order.
 * Stored names absent from the result stay dormant (never rendered).
 */
export function orderColumns(resultColumns: string[], storedOrder: string[]): string[] {
    const resultColSet = new Set(resultColumns);
    const ordered: string[] = [];
    const orderedSet = new Set<string>();

    // 1. Keep stored columns that exist in the result.
    for (const col of storedOrder) {
        if (resultColSet.has(col) && !orderedSet.has(col)) {
            ordered.push(col);
            orderedSet.add(col);
        }
    }

    // 2. Append result columns that are not in the stored order (newly added or not yet saved).
    for (const col of resultColumns) {
        if (!orderedSet.has(col)) {
            ordered.push(col);
            orderedSet.add(col);
        }
    }

    return ordered;
}
