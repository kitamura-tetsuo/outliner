// Yjs data model for the Grid feature.
//
// A Grid is a project-level presentation/query definition that references one
// primary Table (its `sourceTableId`, i.e. the write target). Multiple Grids
// may reference the same Table so several filtered/labeled views can share the
// same underlying schema/data without cloning it.
//
// Grid state is stored as a nested Y.Map inside a project-level registry, not
// as a subdoc: a Grid definition is a handful of small fields (query, column
// order, per-column UI settings) that every collaborator loads eagerly with
// the project doc, so a subdoc's lazy-load lifecycle would be pure cost with
// no benefit.
//
// Each Grid Y.Map holds:
//   sourceTableId  string    - the primary Table (write target).
//   query          string    - SELECT text.
//   columnOrder    string[]  - display column order (subset/superset of query result).
//   components     Y.Map     - nested Y.Map per column with {type,label,hidden}.

import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";

export const GRID_REGISTRY_KEY = "yjsGrids";

/** Fields carried on a Grid registry entry. */
export interface GridRegistryEntry {
    gridId: string;
    /** Free-form label (never appears in SQL). */
    name: string;
    /** The primary/writable Table this Grid targets. */
    sourceTableId: string;
}

/** Structural handles for one Grid definition. */
export interface GridHandles {
    gridId: string;
    /** The registry Y.Map entry — the same object listing yields. */
    entry: Y.Map<unknown>;
    /** SELECT/query text container (Y.Map key, updated via `setGridQuery`). */
    /** The nested map of per-column UI settings (Y.Map<column, Y.Map<{type,label,hidden}>>). */
    components: Y.Map<Y.Map<unknown>>;
    /** Undo scope covering only this Grid's authoritative state. */
    undo: Y.UndoManager;
    /** The project doc this Grid belongs to. */
    projectDoc: Y.Doc;
}

// A single UndoManager is shared by every view of a Grid, so it is
// reference-counted: two outline blocks can bind to the same Grid (the
// "Existing Grid" option), and unmounting one must not destroy the manager the
// other still edits through. The manager is torn down only when the last
// consumer releases it or the Grid itself is removed.
interface GridUndoEntry {
    undo: Y.UndoManager;
    refs: number;
}
const gridUndoManagers = new WeakMap<Y.Map<unknown>, GridUndoEntry>();

export function getGridRegistry(projectDoc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return projectDoc.getMap<Y.Map<unknown>>(GRID_REGISTRY_KEY);
}

export function listGrids(projectDoc: Y.Doc): GridRegistryEntry[] {
    const registry = getGridRegistry(projectDoc);
    const entries: GridRegistryEntry[] = [];
    registry.forEach((entry, gridId) => {
        entries.push({
            gridId,
            name: String(entry.get("name") ?? ""),
            sourceTableId: String(entry.get("sourceTableId") ?? ""),
        });
    });
    return entries;
}

function ensureComponents(entry: Y.Map<unknown>): Y.Map<Y.Map<unknown>> {
    let components = entry.get("components");
    if (!(components instanceof Y.Map)) {
        components = new Y.Map<Y.Map<unknown>>();
        entry.set("components", components);
    }
    return components as Y.Map<Y.Map<unknown>>;
}

export interface CreateGridOptions {
    name?: string;
    query?: string;
    columnOrder?: string[];
    /** Optional seed per column (label/type/hidden). */
    components?: Record<string, { type?: string; label?: string; hidden?: boolean; }>;
    /** Deterministic id (for tests or duplication). */
    gridId?: string;
}

/**
 * Create a new Grid in the project registry with the given `sourceTableId`.
 * Returns the new Grid id. All initialization happens in one transaction so
 * observers never see a partially populated Grid.
 */
export function createGrid(
    projectDoc: Y.Doc,
    sourceTableId: string,
    options: CreateGridOptions = {},
): string {
    const gridId = options.gridId ?? uuidv4();
    projectDoc.transact(() => {
        const entry = new Y.Map<unknown>();
        entry.set("sourceTableId", sourceTableId);
        entry.set("name", options.name ?? "Grid");
        if (options.query !== undefined) entry.set("query", options.query);
        if (options.columnOrder && options.columnOrder.length > 0) {
            entry.set("columnOrder", [...options.columnOrder]);
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
    return gridId;
}

/** Remove a Grid from the registry and dispose its undo manager. */
export function removeGrid(projectDoc: Y.Doc, gridId: string): boolean {
    const registry = getGridRegistry(projectDoc);
    const entry = registry.get(gridId);
    if (!entry) return false;
    destroyGridUndoManager(entry);
    projectDoc.transact(() => registry.delete(gridId));
    return true;
}

export function getGridHandles(projectDoc: Y.Doc, gridId: string): GridHandles | undefined {
    const entry = getGridRegistry(projectDoc).get(gridId);
    if (!entry) return undefined;
    const components = ensureComponents(entry);

    let managed = gridUndoManagers.get(entry);
    if (!managed) {
        const undo = new Y.UndoManager([entry, components], {
            trackedOrigins: new Set([null]),
        });
        managed = { undo, refs: 0 };
        gridUndoManagers.set(entry, managed);
        globalUndoRouter.register(undo);
    }

    return { gridId, entry, components, undo: managed.undo, projectDoc };
}

/**
 * Claim a reference to a Grid's shared UndoManager for a view's lifetime.
 * Call once per mounted consumer (paired with `destroyGridUndoManager`).
 */
export function retainGridUndoManager(entry: Y.Map<unknown>): void {
    const managed = gridUndoManagers.get(entry);
    if (managed) managed.refs++;
}

/**
 * Release a view's reference to the Grid's UndoManager. The manager is
 * destroyed only when the last referencing view releases it; a call with no
 * outstanding references (e.g. from `removeGrid`) tears it down immediately so
 * a deleted Grid never leaves a manager registered on the global router.
 */
export function destroyGridUndoManager(entry: Y.Map<unknown>): void {
    const managed = gridUndoManagers.get(entry);
    if (!managed) return;
    if (managed.refs > 0) managed.refs--;
    if (managed.refs > 0) return;
    globalUndoRouter.unregister(managed.undo);
    managed.undo.destroy();
    gridUndoManagers.delete(entry);
}

export function renameGrid(projectDoc: Y.Doc, gridId: string, name: string): void {
    getGridRegistry(projectDoc).get(gridId)?.set("name", name);
}

export function getGridName(projectDoc: Y.Doc, gridId: string): string | undefined {
    const entry = getGridRegistry(projectDoc).get(gridId);
    return entry ? String(entry.get("name") ?? "") : undefined;
}

export function getGridSourceTableId(projectDoc: Y.Doc, gridId: string): string | undefined {
    const value = getGridRegistry(projectDoc).get(gridId)?.get("sourceTableId");
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getGridQuery(handles: GridHandles): string {
    return String(handles.entry.get("query") ?? "");
}

/** Replace the SELECT query text. */
export function setGridQuery(handles: GridHandles, query: string): void {
    if (query === getGridQuery(handles)) return;
    handles.entry.set("query", query);
}

export function getGridColumnOrder(handles: GridHandles): string[] {
    const order = handles.entry.get("columnOrder");
    if (Array.isArray(order)) return order as string[];
    if (order instanceof Y.Array) return order.toArray() as string[];
    return [];
}

export function setGridColumnOrder(handles: GridHandles, order: string[]): void {
    handles.projectDoc.transact(() => {
        handles.entry.set("columnOrder", [...order]);
    });
}

/** Snapshot the per-column UI settings into a plain record for the UI mirror. */
export function readGridComponents(handles: GridHandles): {
    types: Record<string, string | undefined>;
    labels: Record<string, string | undefined>;
    hidden: Record<string, boolean>;
} {
    const types: Record<string, string | undefined> = {};
    const labels: Record<string, string | undefined> = {};
    const hidden: Record<string, boolean> = {};
    handles.components.forEach((cfg, column) => {
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
    handles: GridHandles,
    column: string,
    field: "type" | "label" | "hidden",
    value: string | boolean | undefined,
): void {
    handles.projectDoc.transact(() => {
        const existing = handles.components.get(column);
        const cfg = existing instanceof Y.Map ? existing : new Y.Map<unknown>();
        if (!(existing instanceof Y.Map)) handles.components.set(column, cfg);

        if (value === undefined || value === "") {
            cfg.delete(field);
            if (Array.from(cfg.keys()).length === 0) handles.components.delete(column);
            return;
        }
        cfg.set(field, value);
    });
}

/**
 * Duplicate a Grid definition into a new registry entry. `sourceTableId` and
 * every field (query, columnOrder, components) are copied; Table schema/data
 * are NOT touched. The new Grid gets a fresh id.
 */
export function duplicateGrid(
    projectDoc: Y.Doc,
    gridId: string,
    overrides: { name?: string; } = {},
): string | undefined {
    const source = getGridRegistry(projectDoc).get(gridId);
    if (!source) return undefined;
    const sourceTableId = String(source.get("sourceTableId") ?? "");
    if (!sourceTableId) return undefined;

    const components: Record<string, { type?: string; label?: string; hidden?: boolean; }> = {};
    const sourceComponents = source.get("components");
    if (sourceComponents instanceof Y.Map) {
        sourceComponents.forEach((cfg, column) => {
            if (!(cfg instanceof Y.Map)) return;
            const dto: { type?: string; label?: string; hidden?: boolean; } = {};
            const type = cfg.get("type");
            if (type !== undefined) dto.type = String(type);
            const label = cfg.get("label");
            if (label !== undefined) dto.label = String(label);
            if (cfg.get("hidden") === true) dto.hidden = true;
            components[column] = dto;
        });
    }

    const columnOrderValue = source.get("columnOrder");
    const columnOrder = Array.isArray(columnOrderValue)
        ? [...(columnOrderValue as string[])]
        : columnOrderValue instanceof Y.Array
        ? (columnOrderValue.toArray() as string[])
        : [];

    return createGrid(projectDoc, sourceTableId, {
        name: overrides.name ?? `${String(source.get("name") ?? "Grid")} (copy)`,
        query: String(source.get("query") ?? ""),
        columnOrder,
        components,
    });
}

/** Grids referencing a given source Table id. */
export function findGridsBySourceTable(projectDoc: Y.Doc, sourceTableId: string): GridRegistryEntry[] {
    return listGrids(projectDoc).filter(g => g.sourceTableId === sourceTableId);
}
