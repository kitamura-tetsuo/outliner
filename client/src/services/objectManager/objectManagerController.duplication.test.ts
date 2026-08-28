// Object Manager's `Duplicate selected` (issue #5153): building the preview
// shown before Apply, and applying the duplication as one undo-router step.
import { Project } from "$shared/app-schema";
import { beforeEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { store } from "../../stores/store.svelte";
import { createCalendar } from "../calendar/calendarService";
import { createScheduleRule } from "../schedule/scheduleRuleService";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridHandles, listGrids } from "../yjstable/gridDocs";
import { appendGridPlacement } from "../yjstable/gridPlacement";
import { createTable, listTables } from "../yjstable/tableDocs";
import {
    buildDuplicationSetPreview,
    computePreselection,
    duplicateSelectedObjects,
    getObjects,
    type NamedObject,
    toDuplicableObjects,
} from "./objectManagerController";

function table(doc: Y.Doc, name: string, sqlName: string): string {
    return createTable(doc, name, sqlName, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, title TEXT)`);
    });
}

describe("ObjectManagerController — Duplicate selected", () => {
    let project: Project;

    beforeEach(() => {
        project = Project.createInstance("proj-id");
        store.project = project;
    });

    describe("toDuplicableObjects", () => {
        it("maps display types to the duplication service's lowercase kinds", () => {
            const objects: NamedObject[] = [
                { id: "t1", type: "Table", name: "T", placements: [] },
                { id: "g1", type: "Grid", name: "G", placements: [] },
            ];
            expect(toDuplicableObjects(objects)).toEqual([
                { type: "table", id: "t1" },
                { type: "grid", id: "g1" },
            ]);
        });
    });

    describe("computePreselection", () => {
        it("resolves live ids and collects their types, dropping ids that no longer exist", () => {
            const objects: NamedObject[] = [
                { id: "t1", type: "Table", name: "T", placements: [] },
                { id: "g1", type: "Grid", name: "G", placements: [] },
            ];
            const result = computePreselection(objects, ["t1", "missing", "g1"]);
            expect(result.ids.sort()).toEqual(["g1", "t1"]);
            expect(result.types.sort()).toEqual(["Grid", "Table"]);
        });

        it("returns nothing for an empty request", () => {
            expect(computePreselection([], [])).toEqual({ ids: [], types: [] });
        });
    });

    describe("buildDuplicationSetPreview", () => {
        it("reflects the exact selection, never expanding it through the dependency graph", () => {
            const tableId = table(project.ydoc, "Tasks", "tasks");
            const gridId = createGrid(project.ydoc, tableId, { name: "Board" });
            const objects = getObjects(project);
            const grid = objects.find(o => o.id === gridId)!;

            // Only the Grid is selected — its Table dependency is not.
            const preview = buildDuplicationSetPreview(project, [grid]);
            expect(preview?.objects).toEqual([grid]);
            expect(preview?.countsByType).toEqual({ Grid: 1 });
            expect(preview?.omittedReferenceCount).toBe(1);
        });

        it("returns null for an empty selection", () => {
            expect(buildDuplicationSetPreview(project, [])).toBeNull();
        });
    });

    describe("duplicateSelectedObjects", () => {
        it("duplicates a mixed-type selection as one operation", async () => {
            const tableId = table(project.ydoc, "Tasks", "tasks");
            const gridId = createGrid(project.ydoc, tableId, { name: "Board" });
            const calendarId = createCalendar(project, { name: "Team", query: "" });
            const objects = getObjects(project);
            const selected = objects.filter(o => [tableId, gridId, calendarId].includes(o.id));

            const result = await duplicateSelectedObjects(project.ydoc, project.ydoc, selected, {});
            expect(result?.createdObjects).toHaveLength(3);
            expect(listTables(project.ydoc)).toHaveLength(2);
            expect(listGrids(project.ydoc)).toHaveLength(2);
        });

        it("returns null and creates nothing for an empty selection", async () => {
            const result = await duplicateSelectedObjects(project.ydoc, project.ydoc, [], {});
            expect(result).toBeNull();
        });

        it("undoes the whole operation, across every object type, as a single step", async () => {
            const tableId = table(project.ydoc, "Tasks", "tasks");
            const gridId = createGrid(project.ydoc, tableId, { name: "Board" });
            const ruleId = createScheduleRule(project, {
                targetTableId: tableId,
                sql: "SELECT 1",
                rrule: "RRULE:FREQ=DAILY",
            });
            const objects = getObjects(project);
            const selected = objects.filter(o => [tableId, gridId, ruleId].includes(o.id));

            const depthBefore = globalUndoRouter.undoDepth;
            const result = await duplicateSelectedObjects(project.ydoc, project.ydoc, selected, {});
            expect(globalUndoRouter.undoDepth).toBe(depthBefore + 1);
            expect(listTables(project.ydoc)).toHaveLength(2);

            globalUndoRouter.undo();

            expect(listTables(project.ydoc)).toHaveLength(1);
            expect(listGrids(project.ydoc)).toHaveLength(1);
            expect(project.schedules.size).toBe(1);
            for (const created of result!.createdObjects) {
                expect(getObjects(project).some(o => o.id === created.id)).toBe(false);
            }
        });

        it("redo recreates every duplicated object with the same identity", async () => {
            const tableId = table(project.ydoc, "Tasks", "tasks");
            const gridId = createGrid(project.ydoc, tableId, { name: "Board" });
            const objects = getObjects(project);
            const selected = objects.filter(o => [tableId, gridId].includes(o.id));

            const result = await duplicateSelectedObjects(project.ydoc, project.ydoc, selected, {});
            globalUndoRouter.undo();
            expect(listTables(project.ydoc)).toHaveLength(1);

            globalUndoRouter.redo();

            expect(listTables(project.ydoc)).toHaveLength(2);
            expect(listGrids(project.ydoc)).toHaveLength(2);
            for (const created of result!.createdObjects) {
                expect(getObjects(project).some(o => o.id === created.id)).toBe(true);
            }
        });

        it("folds an afterMaterialize side effect into the same undo/redo step", async () => {
            const tableId = table(project.ydoc, "Tasks", "tasks");
            const gridId = createGrid(project.ydoc, tableId, { name: "Board" });
            const page = project.addPage("Dashboard", "test");
            const objects = getObjects(project);
            const selected = objects.filter(o => o.id === gridId);

            const depthBefore = globalUndoRouter.undoDepth;
            const result = await duplicateSelectedObjects(project.ydoc, project.ydoc, selected, {
                afterMaterialize: created => {
                    const copiedGridId = created.createdObjects.find(o => o.type === "grid")!.id;
                    let placement = appendGridPlacement(project.ydoc, page.id, copiedGridId, "test");
                    return {
                        undo: () => placement.delete(),
                        redo: () => {
                            placement = appendGridPlacement(project.ydoc, page.id, copiedGridId, "test");
                        },
                    };
                },
            });
            // One router entry for both the duplicate and the placement.
            expect(globalUndoRouter.undoDepth).toBe(depthBefore + 1);
            const copiedGridId = result!.createdObjects.find(o => o.type === "grid")!.id;
            expect(getGridHandles(project.ydoc, copiedGridId)).toBeDefined();
            expect([...page.items].some(item => item.componentType === "yjstable")).toBe(true);

            globalUndoRouter.undo();
            expect(getGridHandles(project.ydoc, copiedGridId)).toBeUndefined();
            expect([...page.items].some(item => item.componentType === "yjstable")).toBe(false);

            globalUndoRouter.redo();
            // `redo()` is a synchronous router call, but this entry's own redo
            // re-runs `materializeDuplicationPlan` (async) and only then calls
            // the placement side effect — let both microtasks settle.
            await new Promise(resolve => setTimeout(resolve, 0));
            const recopiedGridId = result!.createdObjects.find(o => o.type === "grid")!.id;
            expect(getGridHandles(project.ydoc, recopiedGridId)).toBeDefined();
            expect([...page.items].some(item => item.componentType === "yjstable")).toBe(true);
        });
    });
});
