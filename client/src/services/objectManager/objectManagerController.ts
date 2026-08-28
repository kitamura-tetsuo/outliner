import type { Project } from "$shared/app-schema";
import { listCalendars, removeCalendarWithPlacements, renameCalendar } from "../calendar/calendarService";
import { deleteScheduleRuleWithUndo, listSchedules, renameSchedule } from "../schedule/scheduleRuleService";
import { listGrids, removeGridWithPlacements, renameGrid } from "../yjstable/gridDocs";
import { getTableDependencies, removeTableWithPolicy, type TableDependencies } from "../yjstable/tableDependencies";
import { listTables, renameTable } from "../yjstable/tableDocs";
import {
    buildObjectDependencyGraph,
    type GraphDirection,
    type ObjectKind,
    traverseObjectGraph,
} from "./objectDependencyGraph";
import { collectAllPlacements, type ObjectPlacement } from "./objectPlacements";

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
            return removeTableWithPolicy(project, object.id, "remove-direct-references") !== undefined;
        case "Schedule":
            return deleteScheduleRuleWithUndo(project, object.id);
    }
}
