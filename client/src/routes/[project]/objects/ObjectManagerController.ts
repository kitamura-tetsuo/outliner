import type { Project } from "$shared/app-schema";
import { listSchedules, renameSchedule } from "../../../services/schedule/scheduleRuleService";
import { listGrids, renameGrid } from "../../../services/yjstable/gridDocs";
import { listTables, renameTable } from "../../../services/yjstable/tableDocs";

export interface NamedObject {
    id: string;
    type: "Table" | "Grid" | "Schedule";
    name: string;
}

export interface BulkPreviewItem extends NamedObject {
    newName: string;
    willChange: boolean;
}

export function getObjects(project: Project | null | undefined): NamedObject[] {
    if (!project || !project.ydoc) return [];

    const tables = listTables(project.ydoc).map(t => ({ id: t.tableId, type: "Table" as const, name: t.name }));
    const grids = listGrids(project.ydoc).map(g => ({ id: g.gridId, type: "Grid" as const, name: g.name }));
    const schedules = listSchedules(project).map(s => ({ id: s.id, type: "Schedule" as const, name: s.name }));

    return [...tables, ...grids, ...schedules];
}

export function filterObjects(objects: NamedObject[], selectedTypes: Set<string>, searchQuery: string): NamedObject[] {
    return objects.filter(o =>
        selectedTypes.has(o.type)
        && o.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
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

export function validateRename(
    _project: Project | null | undefined,
    _type: string,
    _id: string,
    _newName: string,
): string | null {
    // Basic validation. No conflicts are generated here unless needed based on schemas.
    return null;
}

export function applyRename(project: Project | null | undefined, type: string, id: string, newName: string) {
    if (!project || !project.ydoc) return;

    if (type === "Table") {
        renameTable(project.ydoc, id, newName);
    } else if (type === "Grid") {
        renameGrid(project.ydoc, id, newName);
    } else if (type === "Schedule") {
        renameSchedule(project, id, newName);
    }
}
