import type { Project } from "$shared/app-schema";
import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { listCalendars, removeCalendarWithPlacements, renameCalendar } from "../calendar/calendarService";
import { deleteScheduleRuleWithUndo, listSchedules, renameSchedule } from "../schedule/scheduleRuleService";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import type { ManualUndoEntry } from "../undo/undoRouter.svelte";
import { listGrids, removeGridWithPlacements, renameGrid } from "../yjstable/gridDocs";
import {
    type DuplicableObject,
    duplicateObjectSet,
    type DuplicationSetResult,
    materializeDuplicationPlan,
    previewObjectSetDuplication,
    rollbackObjectDuplication,
} from "../yjstable/objectDuplication";
import {
    getTableDependencies,
    removeTableWithPolicyUndoable,
    type TableDependencies,
} from "../yjstable/tableDependencies";
import { listTables, renameTable } from "../yjstable/tableDocs";
import {
    buildObjectDependencyGraph,
    type GraphDirection,
    type ObjectKind,
    traverseObjectGraph,
} from "./objectDependencyGraph";
import { collectAllPlacements, type ObjectPlacement } from "./objectPlacements";

const logger = getLogger("objectManagerController");

export type ObjectType = "Table" | "Grid" | "Schedule" | "Calendar";

export const OBJECT_TYPES: ObjectType[] = ["Table", "Grid", "Calendar", "Schedule"];

/** Object Manager's related-selection scope, matching duplication's directional semantics (issue #5135 §2). */
export type RelatedSelectionScope = GraphDirection;

export const RELATED_SELECTION_SCOPES: { value: RelatedSelectionScope; label: string; }[] = [
    { value: "dependencies", label: "Dependencies" },
    { value: "dependents", label: "Dependents" },
    { value: "connected", label: "All connected" },
];

const OBJECT_TYPE_TO_KIND: Record<ObjectType, ObjectKind> = {
    Table: "table",
    Grid: "grid",
    Calendar: "calendar",
    Schedule: "schedule",
};

export interface NamedObject {
    id: string;
    type: ObjectType;
    name: string;
    /**
     * Direct visual placements in the outline. Always empty for Table and
     * Schedule — neither is itself a rendered visual node, so neither claims
     * the Pages of the Grids/Calendars that merely reference it (#5119).
     */
    placements: ObjectPlacement[];
}

export interface BulkPreviewItem extends NamedObject {
    newName: string;
    willChange: boolean;
}

export function getObjects(project: Project | null | undefined): NamedObject[] {
    if (!project || !project.ydoc) return [];

    const { gridPlacements, calendarPlacements } = collectAllPlacements(project);

    const tables = listTables(project.ydoc).map(t => ({
        id: t.tableId,
        type: "Table" as const,
        name: t.name,
        placements: [],
    }));
    const grids = listGrids(project.ydoc).map(g => ({
        id: g.gridId,
        type: "Grid" as const,
        name: g.name,
        placements: gridPlacements.get(g.gridId) ?? [],
    }));
    const calendars = listCalendars(project).map(c => ({
        id: c.id,
        type: "Calendar" as const,
        name: c.settings.name,
        placements: calendarPlacements.get(c.id) ?? [],
    }));
    const schedules = listSchedules(project).map(s => ({
        id: s.id,
        type: "Schedule" as const,
        name: s.name,
        placements: [],
    }));

    return [...tables, ...grids, ...calendars, ...schedules];
}

export function filterObjects(objects: NamedObject[], selectedTypes: Set<string>, searchQuery: string): NamedObject[] {
    return objects.filter(o =>
        selectedTypes.has(o.type)
        && o.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
}

/**
 * Expand the current selection to include every object related to it, via
 * the shared dependency-graph service (issue #5135 §2/§3) — the same graph
 * recursive duplication traverses. Every currently selected object is a
 * traversal root, the result is the union of all traversals, and each object
 * appears at most once; existing selections are always kept since this only
 * ever returns ids to add, never to remove. `objects` must be the full
 * (unfiltered) list so an object hidden by the current search/type filter can
 * still be discovered and selected.
 */
export function selectRelatedObjects(
    project: Project | null | undefined,
    objects: NamedObject[],
    selectedObjectIds: ReadonlySet<string>,
    scope: RelatedSelectionScope,
): string[] {
    if (!project?.ydoc || selectedObjectIds.size === 0) return [];
    const byId = new Map(objects.map(o => [o.id, o]));
    const roots = [...selectedObjectIds]
        .map(id => byId.get(id))
        .filter((object): object is NamedObject => object !== undefined)
        .map(object => ({ type: OBJECT_TYPE_TO_KIND[object.type], id: object.id }));
    if (roots.length === 0) return [];

    const graph = buildObjectDependencyGraph(project.ydoc);
    return traverseObjectGraph(graph, roots, scope).map(object => object.id);
}

export interface Preselection {
    /** Ids from `preselectedIds` that actually exist right now. */
    ids: string[];
    /** Their types, so the caller can widen the type filter to keep them visible (issue #5153 §11). */
    types: ObjectType[];
}

/**
 * Resolve a route's `?selected=` object ids (issue #5153 §11 — an individual
 * object's Duplicate action opens Object Manager with it preselected) against
 * the live object list. Ids that no longer exist are silently dropped rather
 * than left dangling in the selection.
 */
export function computePreselection(objects: NamedObject[], preselectedIds: readonly string[]): Preselection {
    const requested = new Set(preselectedIds);
    const found = objects.filter(object => requested.has(object.id));
    return { ids: found.map(object => object.id), types: [...new Set(found.map(object => object.type))] };
}

export function generateBulkPreview(
    objects: NamedObject[],
    selectedObjectIds: Set<string>,
    findText: string,
    replaceText: string,
): BulkPreviewItem[] {
    if (!findText) return [];

    return objects
        .filter(o => selectedObjectIds.has(o.id))
        .map(o => {
            const newName = o.name.replaceAll(findText, replaceText);
            return {
                ...o,
                newName,
                willChange: newName !== o.name,
            };
        })
        .filter(p => p.willChange);
}

export function countHiddenSelected(
    objects: NamedObject[],
    visibleObjects: NamedObject[],
    selectedIds: ReadonlySet<string>,
): number {
    const existing = new Set(objects.map(object => object.id));
    const visible = new Set(visibleObjects.map(object => object.id));
    return [...selectedIds].filter(id => existing.has(id) && !visible.has(id)).length;
}

export function validateBulkPreview(
    project: Project | null | undefined,
    previews: BulkPreviewItem[],
): Map<string, string> {
    const errors = new Map<string, string>();
    for (const preview of previews) {
        const error = validateRename(project, preview.type, preview.id, preview.newName);
        if (error) errors.set(preview.id, error);
    }
    return errors;
}

/**
 * Rename validation. Duplicate display names across objects are explicitly
 * allowed (#5103) — the only thing this rejects is an edit that would leave
 * the object unnamed, since silently discarding such an edit would strand
 * the user with no way to tell what happened to it.
 */
export function validateRename(
    _project: Project | null | undefined,
    _type: string,
    _id: string,
    newName: string,
): string | null {
    if (!newName.trim()) return "Name cannot be empty.";
    return null;
}

export function applyRename(project: Project | null | undefined, type: string, id: string, newName: string) {
    if (!project || !project.ydoc) return;

    if (type === "Table") {
        renameTable(project.ydoc, id, newName);
    } else if (type === "Grid") {
        renameGrid(project.ydoc, id, newName);
    } else if (type === "Calendar") {
        renameCalendar(project, id, newName);
    } else if (type === "Schedule") {
        renameSchedule(project, id, newName);
    }
}

export interface DeleteImpact {
    /** Direct outline placements the delete will remove (Grid/Calendar only). */
    placements: ObjectPlacement[];
    /** Set for Table only: reuses the existing dependency-safety preview (#5012/#5103). */
    tableDependencies?: TableDependencies;
}

/** What deleting `object` will affect, for the confirmation dialog. */
export function getDeleteImpact(project: Project | null | undefined, object: NamedObject): DeleteImpact {
    if (!project) return { placements: [] };
    if (object.type === "Table") {
        return { placements: [], tableDependencies: getTableDependencies(project, object.id) };
    }
    return { placements: object.placements };
}

/**
 * Delete the project-level object identified by `object`, as one undoable
 * user operation (#5119). Grid and Calendar also remove every outline
 * placement that directly renders them, so no empty visual-node shell is left
 * behind. Table and Schedule reuse their own existing deletion semantics
 * (#5012/#5103) rather than a second, inconsistent path.
 */
export function deleteObject(project: Project | null | undefined, object: NamedObject): boolean {
    if (!project || !project.ydoc) return false;

    switch (object.type) {
        case "Grid":
            return removeGridWithPlacements(project, object.id);
        case "Calendar":
            return removeCalendarWithPlacements(project, object.id);
        case "Table":
            return removeTableWithPolicyUndoable(project, object.id);
        case "Schedule":
            return deleteScheduleRuleWithUndo(project, object.id);
    }
}

/** Delete an exact, pre-snapshotted target set as one undo-router operation. */
export function deleteObjects(project: Project | null | undefined, objects: NamedObject[]): boolean {
    if (!project?.ydoc || objects.length === 0) return false;
    const liveIds = new Set(getObjects(project).map(object => object.id));
    if (objects.some(object => !liveIds.has(object.id))) return false;
    return globalUndoRouter.captureManualGroup(`Delete ${objects.length} objects`, () => {
        for (const object of objects) {
            if (!deleteObject(project, object)) return false;
        }
        return true;
    });
}

/** Convert Object Manager's display objects to the dependency-graph/duplication service's shape. */
export function toDuplicableObjects(objects: NamedObject[]): DuplicableObject[] {
    return objects.map(object => ({ type: OBJECT_TYPE_TO_KIND[object.type], id: object.id }));
}

export interface DuplicationSetPreview {
    /** The exact, deduped selection that will be duplicated — never expanded through the dependency graph (issue #5153 §2). */
    objects: NamedObject[];
    countsByType: Partial<Record<ObjectType, number>>;
    /** References from a selected object to an object outside the selection (see `previewObjectSetDuplication`). */
    omittedReferenceCount: number;
}

/**
 * Preview for Object Manager's `Duplicate selected` (issue #5153 §8): the
 * selection itself is the authoritative scope, so this only classifies it —
 * it never traverses the dependency graph to add anything, unlike
 * `selectRelatedObjects`.
 */
export function buildDuplicationSetPreview(
    project: Project | null | undefined,
    selected: NamedObject[],
): DuplicationSetPreview | null {
    if (!project?.ydoc || selected.length === 0) return null;
    const preview = previewObjectSetDuplication(project.ydoc, toDuplicableObjects(selected));
    const byId = new Map(selected.map(object => [object.id, object]));
    const objects = preview.objects
        .map(graphObject => byId.get(graphObject.id))
        .filter((object): object is NamedObject => object !== undefined);
    const countsByType: Partial<Record<ObjectType, number>> = {};
    for (const object of objects) countsByType[object.type] = (countsByType[object.type] ?? 0) + 1;
    return { objects, countsByType, omittedReferenceCount: preview.omittedReferenceCount };
}

/** A caller-supplied side effect folded into `duplicateSelectedObjects`'s single undo step — see `afterMaterialize`. */
export interface DuplicationSideEffect {
    undo: () => void;
    redo: () => void;
}

/**
 * Duplicate an exact, pre-snapshotted selection into `destinationDoc` as one
 * undo-router operation (issue #5153 §9): the selection is never expanded
 * through the dependency graph (that is `Select related`'s job, done before
 * this is called), materialization allocates every destination id up front so
 * a mid-operation failure cannot leave a partial copy (`duplicateObjectSet`
 * already rolls itself back on error), and the whole thing collapses to one
 * router entry via `captureManualAsync` so a single Undo removes every object
 * it created. Redo replays `materializeDuplicationPlan` with that same id
 * map, so anything created keeps the same identity across an undo/redo cycle.
 */
export async function duplicateSelectedObjects(
    sourceDoc: Y.Doc,
    destinationDoc: Y.Doc,
    selected: NamedObject[],
    options: {
        copyTableData?: boolean;
        synchronizeTableSubdocs?: boolean;
        /**
         * Runs once materialization succeeds, before the undo entry is
         * sealed — e.g. attaching the one copied Grid to a destination Page
         * (issue #5153 §5). Any Yjs edits it makes are folded into the same
         * undo step; its own `undo`/`redo` are called in the right order
         * around the object graph's (placement after creation, before removal).
         */
        afterMaterialize?: (result: DuplicationSetResult) => DuplicationSideEffect | void;
    },
): Promise<DuplicationSetResult | null> {
    if (selected.length === 0) return null;
    let result: DuplicationSetResult | undefined;
    let sideEffect: DuplicationSideEffect | void;
    await globalUndoRouter.captureManualAsync(
        async () => {
            result = await duplicateObjectSet(sourceDoc, destinationDoc, toDuplicableObjects(selected), options);
            try {
                sideEffect = options.afterMaterialize?.(result);
            } catch (error) {
                // A side effect (e.g. attaching the copied Grid to a
                // destination Page) that fails after materialization
                // succeeded must not strand the created objects with no
                // undo entry pointing at them — this catch is what makes
                // that rollback unconditional even on this failure path.
                rollbackObjectDuplication(destinationDoc, result);
                result = undefined;
                throw error;
            }
        },
        {
            type: "manual",
            label: `Duplicate ${selected.length} objects`,
            undo: () => {
                sideEffect?.undo();
                if (result) rollbackObjectDuplication(destinationDoc, result);
            },
            redo: () => {
                if (!result) return;
                const created = result;
                // `runAsyncWithoutAutoCapture`, not a bare call: this redo
                // re-runs Yjs transactions (materialization, then the
                // placement side effect) after the router's own synchronous
                // wrapper around `entry.redo()` has already returned, so
                // without it every registered Y.UndoManager would auto-capture
                // these as a second, untracked entry (issue #5153 §9 review).
                void globalUndoRouter.runAsyncWithoutAutoCapture(async () => {
                    await materializeDuplicationPlan(
                        sourceDoc,
                        destinationDoc,
                        created.sourceObjects,
                        {
                            copyTableData: options.copyTableData,
                            synchronizeTableSubdocs: options.synchronizeTableSubdocs,
                        },
                        created.idMap,
                    );
                    sideEffect?.redo();
                }).catch(error => logger.error({ error }, "Redo of Duplicate selected failed"));
            },
        } satisfies ManualUndoEntry,
    );
    return result ?? null;
}
