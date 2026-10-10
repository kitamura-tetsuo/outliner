// Yjs data model for the Kanban feature.
//
// A Kanban is a project-level presentation/query definition that references
// one Table (its `sourceTableId`). Multiple Kanbans may reference the same
// Table so several grouped views can share the same underlying schema/data
// without cloning it. Cards are produced later by executing the stored SELECT
// against that shared data; this module persists only the definition.
//
// Kanban state is stored as a flat entry in a project-level registry (a
// `yjsKanbans` Y.Map of id -> Y.Map of settings), not as a subdoc: a Kanban
// definition is a handful of small fields (name, source reference, query,
// grouping/title roles, detail order, lane preference) that every
// collaborator loads eagerly with the project doc, so a subdoc's lazy-load
// lifecycle would be pure cost with no benefit — the same shape Grids use
// (see `gridDocs.ts`).
//
// Each Kanban Y.Map holds:
//   sourceTableId  string            - the Table this board views.
//   name           string            - free-form label (never appears in SQL).
//   query          string            - exact SELECT text ("" means incomplete).
//   groupField     string | absent   - grouping result-column name.
//   titleField     string | absent   - card-title result-column name.
//   detailFields   string[]          - ordered visible detail-column names.
//   laneOrder      (string|null)[]   - ordered preferred lane values; SQL NULL
//                                     is a real null, distinct from ""/"NULL".

import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
    getKanbanRegistry,
    type KanbanDefinitionSeed,
    type KanbanDefinitionTarget,
    type KanbanSettings,
    type KanbanUpdates,
    readKanbanSettings,
    willKanbanUpdateChange,
} from "$shared/services/kanbanDefinition";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { getTableRegistry } from "./tableDocs";

// The Kanban writers/readers are framework-neutral and shared with the
// server (shared/src/services/kanbanDefinition.ts), so server-side
// regressions run the browser's exact creation/editing functions.
export {
    getKanbanRegistry,
    KANBAN_REGISTRY_KEY,
    type KanbanDefinitionSeed,
    type KanbanLaneValue,
    type KanbanSettings,
    type KanbanUpdates,
    readKanbanSettings,
} from "$shared/services/kanbanDefinition";

/** Fields carried on a Kanban registry entry. */
export interface KanbanRegistryEntry {
    kanbanId: string;
    /** Free-form label (never appears in SQL; never identity). */
    name: string;
    /** The Table this board views. */
    sourceTableId: string;
}

/** Structural handles for one Kanban definition. */
export interface KanbanHandles extends KanbanDefinitionTarget {
    kanbanId: string;
    /** Undo scope covering only this Kanban's authoritative state. */
    undo: Y.UndoManager;
}

// A single UndoManager is shared by every view of a Kanban, so it is
// reference-counted: two consumers can bind to the same board, and releasing
// one must not destroy the manager the other still edits through. The manager
// is torn down only when the last consumer releases it or the Kanban itself
// is removed.
interface KanbanUndoEntry {
    undo: Y.UndoManager;
    refs: number;
}
const kanbanUndoManagers = new WeakMap<Y.Map<unknown>, KanbanUndoEntry>();

function ensureKanbanUndoManager(entry: Y.Map<unknown>): Y.UndoManager {
    let managed = kanbanUndoManagers.get(entry);
    if (!managed) {
        const undo = new Y.UndoManager([entry], {
            trackedOrigins: new Set([null]),
        });
        managed = { undo, refs: 0 };
        kanbanUndoManagers.set(entry, managed);
        globalUndoRouter.register(undo);
    }
    return managed.undo;
}

/** Read-only enumeration of a project's Kanban definitions. Modifies nothing. */
export function listKanbans(projectDoc: Y.Doc): KanbanRegistryEntry[] {
    const registry = getKanbanRegistry(projectDoc);
    const entries: KanbanRegistryEntry[] = [];
    registry.forEach((entry, kanbanId) => {
        entries.push({
            kanbanId,
            name: String(entry.get("name") ?? ""),
            sourceTableId: String(entry.get("sourceTableId") ?? ""),
        });
    });
    return entries;
}

/** Read one Kanban definition. Returns undefined for absent/deleted ids without creating anything. */
export function getKanban(projectDoc: Y.Doc, kanbanId: string): KanbanSettings | undefined {
    const entry = getKanbanRegistry(projectDoc).get(kanbanId);
    return entry ? readKanbanSettings(entry) : undefined;
}

export interface CreateKanbanOptions extends KanbanDefinitionSeed {
    /** Deterministic id (for tests). */
    kanbanId?: string;
}

function assertSourceTableExists(projectDoc: Y.Doc, sourceTableId: string): void {
    if (!getTableRegistry(projectDoc).has(sourceTableId)) {
        throw new Error(`Kanban source Table does not exist: ${sourceTableId}`);
    }
}

/**
 * Create a new Kanban in the project registry over an existing Table of the
 * same project. Returns the new Kanban id. Creates exactly one Kanban
 * identity and no Table, Grid, source record or Page placement. All
 * initialization happens in one transaction so observers never see a
 * partially populated definition.
 */
export function createKanban(
    projectDoc: Y.Doc,
    sourceTableId: string,
    options: CreateKanbanOptions = {},
): string {
    // Validated before the operation has any effect: a missing/foreign Table
    // or a structurally invalid seed rejects the whole creation rather than
    // partially seeding a definition.
    if (typeof sourceTableId !== "string" || sourceTableId.length === 0) {
        throw new Error("Kanban sourceTableId must be a non-empty string");
    }
    assertSourceTableExists(projectDoc, sourceTableId);
    const { kanbanId, ...seed } = options;
    const newId = kanbanId ?? uuidv4();
    createKanbanEntry(projectDoc, newId, sourceTableId, seed);
    return newId;
}

/** Close this Kanban's UndoManager capture window when one is registered. */
function isolateKanbanHistory(entry: Y.Map<unknown>): void {
    kanbanUndoManagers.get(entry)?.undo.stopCapturing();
}

/**
 * Update settings of an existing Kanban. Only explicitly supplied settings
 * are modified; everything else is preserved. Every supplied field is
 * validated (including referenced Table existence for a source-reference
 * change) before any part of the mutation is published, so an invalid update
 * fails without partial changes. A missing target throws instead of being
 * recreated. Supplied values equal to the stored ones perform no Yjs write
 * and record no history.
 *
 * The capture window is closed on both sides of an effectful update so one
 * completed update records exactly one history step: it neither merges into
 * a preceding Kanban edit nor absorbs the next one. The shared leaf writer
 * keeps sole authority over validation, reads and the Yjs writes themselves.
 */
export function updateKanban(projectDoc: Y.Doc, kanbanId: string, updates: KanbanUpdates): void {
    const entry = getKanbanRegistry(projectDoc).get(kanbanId);
    if (!entry) throw new Error(`Kanban with id ${kanbanId} not found`);
    if (updates.sourceTableId !== undefined && updates.sourceTableId !== String(entry.get("sourceTableId") ?? "")) {
        if (typeof updates.sourceTableId !== "string" || updates.sourceTableId.length === 0) {
            throw new Error("Kanban sourceTableId must be a non-empty string");
        }
        assertSourceTableExists(projectDoc, updates.sourceTableId);
    }
    const isolated = willKanbanUpdateChange(entry, updates);
    if (!isolated) return;
    isolateKanbanHistory(entry);
    try {
        ensureKanbanUndoManager(entry);
        applyKanbanUpdates({ projectDoc, entry }, updates);
    } finally {
        isolateKanbanHistory(entry);
    }
}

/**
 * Remove a Kanban from the registry and dispose its undo manager. Removes
 * only that definition and its local resources — never its source Table,
 * records or other view definitions. Placement cleanup belongs to the
 * separate reference-lifecycle stage, not to this low-level operation.
 */
export function removeKanban(projectDoc: Y.Doc, kanbanId: string): boolean {
    const registry = getKanbanRegistry(projectDoc);
    const entry = registry.get(kanbanId);
    if (!entry) return false;
    destroyKanbanUndoManager(entry);
    projectDoc.transact(() => registry.delete(kanbanId));
    return true;
}

/**
 * Open production handles for one Kanban definition. Returns undefined for
 * absent/deleted ids without creating a definition, substituting another
 * object's definition or repairing references.
 */
export function getKanbanHandles(projectDoc: Y.Doc, kanbanId: string): KanbanHandles | undefined {
    const target = getKanbanDefinitionTarget(projectDoc, kanbanId);
    if (!target) return undefined;
    const undo = ensureKanbanUndoManager(target.entry);
    return { kanbanId, entry: target.entry, undo, projectDoc };
}

/**
 * Claim a reference to a Kanban's shared UndoManager for a consumer's
 * lifetime. Call once per mounted consumer (paired with
 * `destroyKanbanUndoManager`).
 */
export function retainKanbanUndoManager(entry: Y.Map<unknown>): void {
    const managed = kanbanUndoManagers.get(entry);
    if (managed) managed.refs++;
}

/**
 * Release a consumer's reference to the Kanban's UndoManager. The manager is
 * destroyed only when the last referencing consumer releases it; a call with
 * no outstanding references (e.g. from `removeKanban`) tears it down
 * immediately so a deleted Kanban never leaves a manager registered on the
 * global router.
 */
export function destroyKanbanUndoManager(entry: Y.Map<unknown>): void {
    const managed = kanbanUndoManagers.get(entry);
    if (!managed) return;
    if (managed.refs > 0) managed.refs--;
    if (managed.refs > 0) return;
    globalUndoRouter.unregister(managed.undo);
    managed.undo.destroy();
    kanbanUndoManagers.delete(entry);
}

export function getKanbanName(projectDoc: Y.Doc, kanbanId: string): string | undefined {
    const entry = getKanbanRegistry(projectDoc).get(kanbanId);
    return entry ? String(entry.get("name") ?? "") : undefined;
}

export function getKanbanSourceTableId(projectDoc: Y.Doc, kanbanId: string): string | undefined {
    const value = getKanbanRegistry(projectDoc).get(kanbanId)?.get("sourceTableId");
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Kanbans referencing a given source Table id. */
export function findKanbansBySourceTable(projectDoc: Y.Doc, sourceTableId: string): KanbanRegistryEntry[] {
    return listKanbans(projectDoc).filter(k => k.sourceTableId === sourceTableId);
}

/**
 * Subscribe to changes on the Kanban registry: any definition created,
 * edited or deleted. Mirrors the observeDeep mirror pattern (AGENTS.md §11)
 * rather than polling. Returns an unsubscribe function. Subscribing never
 * creates or repairs a definition.
 */
export function observeKanbans(projectDoc: Y.Doc, onChange: () => void): () => void {
    const registry = getKanbanRegistry(projectDoc);
    const handler = () => onChange();
    registry.observeDeep(handler);
    return () => registry.unobserveDeep(handler);
}
