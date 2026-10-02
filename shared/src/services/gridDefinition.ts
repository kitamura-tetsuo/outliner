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
    /** The nested map of per-column UI settings (Y.Map<column, Y.Map<{type,label,hidden}>>). */
    components: Y.Map<Y.Map<unknown>>;
}

export interface GridDefinitionSeed {
    name?: string;
    query?: string;
    columnOrder?: string[];
    /** Optional seed per column (label/type/hidden). */
    components?: Record<string, { type?: string; label?: string; hidden?: boolean; }>;
    /** Defaults to true. Setting to false explicitly disables the Add row button. */
    showAddRowButton?: boolean;
    /** Defaults to false. Setting to true requires confirmation to delete a row. */
    confirmRowDelete?: boolean;
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
} {
    const types: Record<string, string | undefined> = {};
    const labels: Record<string, string | undefined> = {};
    const hidden: Record<string, boolean> = {};
    target.components.forEach((cfg, column) => {
        if (!(cfg instanceof Y.Map)) return;
        const type = cfg.get("type");
        if (type !== undefined) types[column] = String(type);
        const label = cfg.get("label");
        if (label !== undefined) labels[column] = String(label);
        if (cfg.get("hidden") === true) hidden[column] = true;
    });
    return { types, labels, hidden };
}

/** Set (or clear) a per-column config field. */
export function setGridComponentField(
    target: GridDefinitionTarget,
    column: string,
    field: "type" | "label" | "hidden",
    value: string | boolean | undefined,
): void {
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
