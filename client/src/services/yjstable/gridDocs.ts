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

import type { Project } from "$shared/app-schema";
import {
    createGridEntry,
    getGridRegistry,
    type GridDefinitionSeed,
    type GridDefinitionTarget,
} from "$shared/services/gridDefinition";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { findGridPlacements } from "../objectManager/objectPlacements";
import { globalUndoRouter } from "../undo/undoRouter.svelte";

// The Grid writers/readers are framework-neutral and shared with the server
// (shared/src/services/gridDefinition.ts), so server-side regressions run the
// browser's exact creation/editing functions.
export {
    getGridColumnOrder,
    getGridConfirmRowDelete,
    getGridQuery,
    getGridRegistry,
    getGridShowAddRowButton,
    GRID_REGISTRY_KEY,
    readGridComponents,
    renameGrid,
    setGridColumnOrder,
    setGridComponentField,
    setGridConfirmRowDelete,
    setGridQuery,
    setGridShowAddRowButton,
} from "$shared/services/gridDefinition";

/** Fields carried on a Grid registry entry. */
export interface GridRegistryEntry {
    gridId: string;
    /** Free-form label (never appears in SQL). */
    name: string;
    /** The primary/writable Table this Grid targets. */
    sourceTableId: string;
    /** Whether the Grid shows the "+ Add row" button when editable (default true). */
    showAddRowButton?: boolean;
    /** Whether deleting a row requires confirmation (default false). */
    confirmRowDelete?: boolean;
}

/** Structural handles for one Grid definition. */
export interface GridHandles extends GridDefinitionTarget {
    gridId: string;
    /** Undo scope covering only this Grid's authoritative state. */
    undo: Y.UndoManager;
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

export function listGrids(projectDoc: Y.Doc): GridRegistryEntry[] {
    const registry = getGridRegistry(projectDoc);
    const entries: GridRegistryEntry[] = [];
    registry.forEach((entry, gridId) => {
        entries.push({
            gridId,
            name: String(entry.get("name") ?? ""),
            sourceTableId: String(entry.get("sourceTableId") ?? ""),
            showAddRowButton: entry.get("showAddRowButton") !== false,
            confirmRowDelete: entry.get("confirmRowDelete") === true,
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

export interface CreateGridOptions extends GridDefinitionSeed {
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
    createGridEntry(projectDoc, gridId, sourceTableId, options);
    return gridId;
}

// `ensureGridForTable()` used to live here: it resolved-or-created a Grid so a
// Table-addressed surface could render through one. That bridge is gone — a
// Table is viewable and editable with zero Grids (issue #5012), and merely
// opening a Table must never mutate the Grid registry. Grids are created only
// by an explicit user action (`createGrid`).

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

export function getGridName(projectDoc: Y.Doc, gridId: string): string | undefined {
    const entry = getGridRegistry(projectDoc).get(gridId);
    return entry ? String(entry.get("name") ?? "") : undefined;
}

export function getGridSourceTableId(projectDoc: Y.Doc, gridId: string): string | undefined {
    const value = getGridRegistry(projectDoc).get(gridId)?.get("sourceTableId");
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Plain-JS copy of a Grid registry entry's fields, detached from the Y.Doc. */
interface GridEntrySnapshot {
    name: string;
    sourceTableId: string;
    query: string;
    columnOrder: string[];
    components: Record<string, { type?: string; label?: string; hidden?: boolean; }>;
    showAddRowButton?: boolean;
    confirmRowDelete?: boolean;
}

/** Read a Grid registry entry into a plain snapshot — shared by `duplicateGrid` and delete/undo. */
function readGridEntrySnapshot(entry: Y.Map<unknown>): GridEntrySnapshot {
    const components: GridEntrySnapshot["components"] = {};
    const sourceComponents = entry.get("components");
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

    const columnOrderValue = entry.get("columnOrder");
    const columnOrder = Array.isArray(columnOrderValue)
        ? [...(columnOrderValue as string[])]
        : columnOrderValue instanceof Y.Array
        ? (columnOrderValue.toArray() as string[])
        : [];

    return {
        name: String(entry.get("name") ?? "Grid"),
        sourceTableId: String(entry.get("sourceTableId") ?? ""),
        query: String(entry.get("query") ?? ""),
        columnOrder,
        components,
        showAddRowButton: entry.get("showAddRowButton") !== false,
        confirmRowDelete: entry.get("confirmRowDelete") === true,
    };
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
    const snapshot = readGridEntrySnapshot(source);
    if (!snapshot.sourceTableId) return undefined;

    return createGrid(projectDoc, snapshot.sourceTableId, {
        name: overrides.name ?? `${snapshot.name} (copy)`,
        query: snapshot.query,
        columnOrder: snapshot.columnOrder,
        components: snapshot.components,
        showAddRowButton: snapshot.showAddRowButton,
        confirmRowDelete: snapshot.confirmRowDelete,
    });
}

/**
 * Delete a Grid and clear every outline item that directly renders it, as one
 * undoable user operation (issue #5119's Object Manager Delete).
 *
 * Placement fields are cleared and restored through the raw node value Y.Map
 * rather than the `Item` class's `componentType` setter, the same bypass
 * `removeTableWithPolicy`'s "remove-direct-references" policy uses: detaching
 * a placement on deletion (or restoring it on undo) is not the "kind
 * mutation" that setter's immutability guard exists to forbid.
 */
export function removeGridWithPlacements(project: Project, gridId: string): boolean {
    const projectDoc = project.ydoc;
    const registry = getGridRegistry(projectDoc);
    const entry = registry.get(gridId);
    if (!entry) return false;

    const snapshot = readGridEntrySnapshot(entry);
    const placements = findGridPlacements(project, gridId);

    const applyDelete = () => {
        projectDoc.transact(() => {
            for (const placement of placements) {
                try {
                    const nodeValue = project.tree.getNodeValueFromKey(placement.itemKey) as
                        | Y.Map<unknown>
                        | undefined;
                    if (nodeValue) {
                        nodeValue.set("componentType", undefined);
                        nodeValue.set("yjsGridId", undefined);
                    }
                } catch (_e) {
                    // Item deleted concurrently; nothing to clear.
                }
            }
            const currentEntry = registry.get(gridId);
            if (currentEntry) destroyGridUndoManager(currentEntry);
            registry.delete(gridId);
        });
    };

    const applyRestore = () => {
        projectDoc.transact(() => {
            createGrid(projectDoc, snapshot.sourceTableId, {
                gridId,
                name: snapshot.name,
                query: snapshot.query,
                columnOrder: snapshot.columnOrder,
                components: snapshot.components,
            });
            for (const placement of placements) {
                try {
                    const nodeValue = project.tree.getNodeValueFromKey(placement.itemKey) as
                        | Y.Map<unknown>
                        | undefined;
                    if (nodeValue) {
                        nodeValue.set("componentType", "yjstable");
                        nodeValue.set("yjsGridId", gridId);
                    }
                } catch (_e) {
                    // Item deleted since the Grid was removed; nothing to restore onto.
                }
            }
        });
    };

    globalUndoRouter.captureManual(applyDelete, {
        type: "manual",
        label: `Delete Grid "${snapshot.name}"`,
        undo: applyRestore,
        redo: applyDelete,
    });

    return true;
}

/** Grids referencing a given source Table id. */
export function findGridsBySourceTable(projectDoc: Y.Doc, sourceTableId: string): GridRegistryEntry[] {
    return listGrids(projectDoc).filter(g => g.sourceTableId === sourceTableId);
}
