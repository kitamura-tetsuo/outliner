import { Project } from "$shared/app-schema";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCalendar, ensureCalendarUndoManager, listCalendars } from "../../../services/calendar/calendarService";
import { findCalendarPlacements, findGridPlacements } from "../../../services/objectManager/objectPlacements";
import {
    createScheduleRule,
    deleteScheduleRuleWithUndo,
    updateScheduleRule,
} from "../../../services/schedule/scheduleRuleService";
import { globalUndoRouter } from "../../../services/undo/undoRouter.svelte";
import {
    createGrid,
    getGridName,
    GRID_REGISTRY_KEY,
    listGrids,
    removeGridWithPlacements,
    renameGrid,
} from "../../../services/yjstable/gridDocs";
import { createTable, getTableName, renameTable, TABLE_REGISTRY_KEY } from "../../../services/yjstable/tableDocs";
import { store } from "../../../stores/store.svelte";
import { deleteObject, getDeleteImpact, getObjects, type NamedObject } from "./ObjectManagerController";

function bindItemToGrid(
    item: { tree: { getNodeValueFromKey: (k: string) => unknown; }; key: string; },
    gridId: string,
): void {
    const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
    nodeValue.set("componentType", "yjstable");
    nodeValue.set("yjsGridId", gridId);
}

function bindItemToCalendar(
    item: { tree: { getNodeValueFromKey: (k: string) => unknown; }; key: string; },
    calendarId: string,
): void {
    const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
    nodeValue.set("componentType", "calendar");
    nodeValue.set("calendarId", calendarId);
}

describe("Objects Manager Requirements", () => {
    let project: Project;

    beforeEach(() => {
        project = Project.createInstance("proj-id");
        store.project = project;
    });

    it("should allow renaming a Table while keeping its ID", () => {
        const tableId = createTable(project.ydoc, "Original Table", "orig_table");

        renameTable(project.ydoc, tableId, "Renamed Table");

        expect(getTableName(project.ydoc, tableId)).toBe("Renamed Table");
        expect(project.ydoc.getMap(TABLE_REGISTRY_KEY).has(tableId)).toBe(true);
    });

    it("should allow renaming a Grid while keeping its ID", () => {
        const gridId = createGrid(project.ydoc, "orig-table", { name: "Original Grid" });

        renameGrid(project.ydoc, gridId, "Renamed Grid");

        expect(getGridName(project.ydoc, gridId)).toBe("Renamed Grid");
        expect(project.ydoc.getMap(GRID_REGISTRY_KEY).has(gridId)).toBe(true);
    });

    it("should allow renaming a Schedule while keeping its ID", () => {
        const ruleId = createScheduleRule(project, {
            name: "Original Schedule",
            targetTableId: "table1",
            sql: "SELECT 1",
            rrule: "",
        });

        updateScheduleRule(project, ruleId, { name: "Renamed Schedule" });

        const schedule = project.schedules.get(ruleId) as Y.Map<ScheduleRuleValueType>;
        expect(schedule.get("name")).toBe("Renamed Schedule");
        expect(project.schedules.has(ruleId)).toBe(true);
    });

    describe("Calendar inclusion", () => {
        it("lists Calendar objects alongside Table, Grid and Schedule", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const calendarId = createCalendar(project, { name: "My Calendar", query: "SELECT 1" });
            const ruleId = createScheduleRule(project, { targetTableId: tableId, sql: "SELECT 1", rrule: "" });

            const objects = getObjects(project);
            const ids = objects.map(o => o.id);
            expect(ids).toEqual(expect.arrayContaining([tableId, gridId, calendarId, ruleId]));
            expect(objects.find(o => o.id === calendarId)?.type).toBe("Calendar");
            expect(objects.find(o => o.id === calendarId)?.name).toBe("My Calendar");
        });

        it("returns the Calendar through the calendar service registry", () => {
            const calendarId = createCalendar(project, { name: "Cal", query: "" });
            expect(listCalendars(project).map(c => c.id)).toContain(calendarId);
        });
    });

    describe("Grid/Calendar direct placement discovery", () => {
        it("finds a single Grid placement", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page = project.addPage("Dashboard", "test");
            const item = page.items.addNode("test");

            project.ydoc.transact(() => bindItemToGrid(item, gridId));

            const placements = findGridPlacements(project, gridId);
            expect(placements).toHaveLength(1);
            expect(placements[0]).toMatchObject({ pageTitle: "Dashboard", itemId: item.id, itemKey: item.key });
        });

        it("finds a single Calendar placement", () => {
            const calendarId = createCalendar(project, { name: "Cal", query: "" });
            const page = project.addPage("Calendar Page", "test");
            const item = page.items.addNode("test");

            project.ydoc.transact(() => bindItemToCalendar(item, calendarId));

            const placements = findCalendarPlacements(project, calendarId);
            expect(placements).toHaveLength(1);
            expect(placements[0].pageTitle).toBe("Calendar Page");
        });

        it("finds multiple placements across different Pages", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page1 = project.addPage("Dashboard", "test");
            const item1 = page1.items.addNode("test");
            const page2 = project.addPage("Today", "test");
            const item2 = page2.items.addNode("test");

            project.ydoc.transact(() => {
                bindItemToGrid(item1, gridId);
                bindItemToGrid(item2, gridId);
            });

            const placements = findGridPlacements(project, gridId);
            expect(placements).toHaveLength(2);
            expect(placements.map(p => p.pageTitle).sort()).toEqual(["Dashboard", "Today"]);
        });

        it("finds multiple placements on the same Page as distinguishable entries", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page = project.addPage("Dashboard", "test");
            const item1 = page.items.addNode("test");
            const item2 = page.items.addNode("test");

            project.ydoc.transact(() => {
                bindItemToGrid(item1, gridId);
                bindItemToGrid(item2, gridId);
            });

            const placements = findGridPlacements(project, gridId);
            expect(placements).toHaveLength(2);
            expect(placements.every(p => p.pageTitle === "Dashboard")).toBe(true);
            // Distinguishable by their own item identity, not merely by Page.
            expect(new Set(placements.map(p => p.itemKey)).size).toBe(2);
        });

        it("a Table does not inherit the Pages of Grids that reference it", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page = project.addPage("Dashboard", "test");
            const item = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToGrid(item, gridId));

            const objects = getObjects(project);
            const table = objects.find(o => o.id === tableId) as NamedObject;
            expect(table.placements).toEqual([]);
        });

        it("a Schedule does not inherit the Pages of Tables/Grids it references", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page = project.addPage("Dashboard", "test");
            const item = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToGrid(item, gridId));
            const ruleId = createScheduleRule(project, { targetTableId: tableId, sql: "SELECT 1", rrule: "" });

            const objects = getObjects(project);
            const schedule = objects.find(o => o.id === ruleId) as NamedObject;
            expect(schedule.placements).toEqual([]);
        });
    });

    describe("Delete", () => {
        it("removeGridWithPlacements deletes the Grid and clears its placements", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page = project.addPage("Dashboard", "test");
            const item = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToGrid(item, gridId));

            const ok = removeGridWithPlacements(project, gridId);
            expect(ok).toBe(true);
            expect(listGrids(project.ydoc).map(g => g.gridId)).not.toContain(gridId);
            const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
            expect(nodeValue.get("componentType")).toBeUndefined();
            expect(nodeValue.get("yjsGridId")).toBeUndefined();
        });

        it("deleteObject removes a Calendar and clears every placement, even several on one Page", () => {
            const calendarId = createCalendar(project, { name: "Cal", query: "" });
            const page = project.addPage("Calendar Page", "test");
            const item1 = page.items.addNode("test");
            const item2 = page.items.addNode("test");
            project.ydoc.transact(() => {
                bindItemToCalendar(item1, calendarId);
                bindItemToCalendar(item2, calendarId);
            });

            const object = getObjects(project).find(o => o.id === calendarId) as NamedObject;
            expect(object.placements).toHaveLength(2);

            const ok = deleteObject(project, object);
            expect(ok).toBe(true);
            expect(listCalendars(project).map(c => c.id)).not.toContain(calendarId);
            for (const item of [item1, item2]) {
                const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
                expect(nodeValue.get("componentType")).toBeUndefined();
                expect(nodeValue.get("calendarId")).toBeUndefined();
            }
        });

        it("deleteObject on a Table reuses the existing dependency-aware removal", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page = project.addPage("Dashboard", "test");
            const item = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToGrid(item, gridId));

            const table = getObjects(project).find(o => o.id === tableId) as NamedObject;
            const impact = getDeleteImpact(project, table);
            expect(impact.tableDependencies?.dependentGridIds).toEqual([gridId]);

            const ok = deleteObject(project, table);
            expect(ok).toBe(true);
            // Reused Table policy also removed the dependent Grid and detached the placement.
            expect(listGrids(project.ydoc).map(g => g.gridId)).not.toContain(gridId);
            const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
            expect(nodeValue.get("componentType")).toBeUndefined();
        });

        it("deleteObject on a Schedule uses the existing Schedule deletion semantics", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const ruleId = createScheduleRule(project, {
                name: "Rule",
                targetTableId: tableId,
                sql: "SELECT 1",
                rrule: "",
            });
            const schedule = getObjects(project).find(o => o.id === ruleId) as NamedObject;

            const ok = deleteObject(project, schedule);
            expect(ok).toBe(true);
            expect(project.schedules.has(ruleId)).toBe(false);
        });
    });

    describe("Undo", () => {
        it("restores a deleted Grid and its placements with a single undo", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G", query: "SELECT * FROM t" });
            const page = project.addPage("Dashboard", "test");
            const item = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToGrid(item, gridId));

            const depthBefore = globalUndoRouter.undoDepth;
            removeGridWithPlacements(project, gridId);
            expect(globalUndoRouter.undoDepth).toBe(depthBefore + 1);
            expect(listGrids(project.ydoc).map(g => g.gridId)).not.toContain(gridId);

            globalUndoRouter.undo();

            expect(listGrids(project.ydoc).map(g => g.gridId)).toContain(gridId);
            expect(getGridName(project.ydoc, gridId)).toBe("G");
            const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
            expect(nodeValue.get("componentType")).toBe("yjstable");
            expect(nodeValue.get("yjsGridId")).toBe(gridId);
        });

        it("redo re-applies a Grid delete after an undo", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page = project.addPage("Dashboard", "test");
            const item = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToGrid(item, gridId));

            removeGridWithPlacements(project, gridId);
            globalUndoRouter.undo();
            expect(listGrids(project.ydoc).map(g => g.gridId)).toContain(gridId);

            globalUndoRouter.redo();
            expect(listGrids(project.ydoc).map(g => g.gridId)).not.toContain(gridId);
            const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
            expect(nodeValue.get("componentType")).toBeUndefined();
        });

        it("restores a deleted Calendar and its placement with a single undo", () => {
            const calendarId = createCalendar(project, { name: "Cal", query: "SELECT 1" });
            const page = project.addPage("Calendar Page", "test");
            const item = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToCalendar(item, calendarId));

            const depthBefore = globalUndoRouter.undoDepth;
            const object = getObjects(project).find(o => o.id === calendarId) as NamedObject;
            deleteObject(project, object);
            expect(globalUndoRouter.undoDepth).toBe(depthBefore + 1);

            globalUndoRouter.undo();

            expect(listCalendars(project).map(c => c.id)).toContain(calendarId);
            const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
            expect(nodeValue.get("componentType")).toBe("calendar");
            expect(nodeValue.get("calendarId")).toBe(calendarId);
        });

        it("does not misalign a later, unrelated outline undo after a Grid delete+undo", () => {
            // Regression: the manual undo entry must purge the orphaned item
            // it caused the orderedTree Y.UndoManager to auto-capture, or
            // that manager's own stack keeps it as its real top item, and a
            // later unrelated outline undo pops the orphaned item instead of
            // the unrelated edit.
            const tableId = createTable(project.ydoc, "T", "t");
            const gridId = createGrid(project.ydoc, tableId, { name: "G" });
            const page = project.addPage("Dashboard", "test");
            const gridItem = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToGrid(gridItem, gridId));
            const textItem = page.items.addNode("test");
            // Close the capture window so the setup above is sealed into its
            // own stack item(s) rather than merging with what follows — the
            // same boundary real, time-separated user gestures get for free.
            store.undoManager!.stopCapturing();

            const outlineManagerDepthBefore = store.undoManager!.undoStack.length;
            removeGridWithPlacements(project, gridId);
            // The orderedTree manager's own stack must not have grown: its
            // auto-captured placement-clear item was purged, not left behind.
            expect(store.undoManager!.undoStack.length).toBe(outlineManagerDepthBefore);

            globalUndoRouter.undo();
            expect(listGrids(project.ydoc).map(g => g.gridId)).toContain(gridId);
            store.undoManager!.stopCapturing();

            // An unrelated outline edit, captured by the same manager.
            project.ydoc.transact(() => {
                const nodeValue = textItem.tree.getNodeValueFromKey(textItem.key) as Y.Map<unknown>;
                nodeValue.set("regressionFlag", true);
            });
            const depthBeforeUnrelatedUndo = globalUndoRouter.undoDepth;

            globalUndoRouter.undo();

            expect(globalUndoRouter.undoDepth).toBe(depthBeforeUnrelatedUndo - 1);
            const textNodeValue = textItem.tree.getNodeValueFromKey(textItem.key) as Y.Map<unknown>;
            expect(textNodeValue.get("regressionFlag")).toBeUndefined();
            // The Grid restore from the earlier undo must still hold — this
            // undo reversed the unrelated edit, not the orphaned delete item.
            expect(listGrids(project.ydoc).map(g => g.gridId)).toContain(gridId);
            const gridNodeValue = gridItem.tree.getNodeValueFromKey(gridItem.key) as Y.Map<unknown>;
            expect(gridNodeValue.get("componentType")).toBe("yjstable");
        });

        it("does not misalign a later, unrelated Calendar undo after a Calendar delete+undo", () => {
            // Calendar delete touches two managers in one transact — the
            // outline's and the calendars registry's own — so this covers the
            // purge for both, not just the single-manager Grid case above.
            const calendarId = createCalendar(project, { name: "Cal", query: "" });
            const page = project.addPage("Calendar Page", "test");
            const item = page.items.addNode("test");
            project.ydoc.transact(() => bindItemToCalendar(item, calendarId));
            // Close the capture window so setup is sealed into its own stack
            // item(s) rather than merging with what follows — the same
            // boundary real, time-separated user gestures get for free.
            store.undoManager!.stopCapturing();
            ensureCalendarUndoManager(project).stopCapturing();

            const object = getObjects(project).find(o => o.id === calendarId) as NamedObject;
            deleteObject(project, object);
            globalUndoRouter.undo();
            expect(listCalendars(project).map(c => c.id)).toContain(calendarId);
            ensureCalendarUndoManager(project).stopCapturing();

            // An unrelated Calendar registry edit, captured by that manager.
            const otherCalendarId = createCalendar(project, { name: "Other", query: "" });
            const depthBeforeUnrelatedUndo = globalUndoRouter.undoDepth;

            globalUndoRouter.undo();

            expect(globalUndoRouter.undoDepth).toBe(depthBeforeUnrelatedUndo - 1);
            expect(listCalendars(project).map(c => c.id)).not.toContain(otherCalendarId);
            // The earlier restore must still hold — this undo reversed the
            // unrelated creation, not the orphaned delete item.
            expect(listCalendars(project).map(c => c.id)).toContain(calendarId);
            const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown>;
            expect(nodeValue.get("componentType")).toBe("calendar");
        });

        it("restores a deleted Schedule with a single undo", () => {
            const tableId = createTable(project.ydoc, "T", "t");
            const ruleId = createScheduleRule(project, {
                name: "Nightly",
                targetTableId: tableId,
                sql: "SELECT 1",
                rrule: "FREQ=DAILY",
            });

            const depthBefore = globalUndoRouter.undoDepth;
            deleteScheduleRuleWithUndo(project, ruleId);
            expect(project.schedules.has(ruleId)).toBe(false);
            expect(globalUndoRouter.undoDepth).toBe(depthBefore + 1);

            globalUndoRouter.undo();

            expect(project.schedules.has(ruleId)).toBe(true);
            const restored = project.schedules.get(ruleId) as Y.Map<ScheduleRuleValueType>;
            expect(restored.get("name")).toBe("Nightly");
            expect(restored.get("sql")).toBe("SELECT 1");
        });
    });
});
