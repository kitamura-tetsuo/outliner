import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { TransferBindings } from "../clipboard/transferBindings";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import {
    createGrid,
    duplicateGrid,
    findGridsByTableDependency,
    getGridColumnOrder,
    getGridConfirmRowDelete,
    getGridHandles,
    getGridQuery,
    getGridRegistry,
    listGrids,
    readGridComponents,
    removeGrid,
    removeGridWithPlacements,
    setGridColumnOrder,
    setGridComponentField,
    setGridConfirmRowDelete,
    setGridQuery,
} from "./gridDocs";
import { appendGridPlacement } from "./gridPlacement";
import { createTable, getTableHandles, listTables } from "./tableDocs";

describe("Grid registry", () => {
    for (const provenance of [false, true]) {
        it(`restores only captured copy provenance through Grid Delete/Undo/Redo; provenance=${provenance}`, () => {
            const project = Project.createInstance("delete-copy-provenance");
            const page = project.addPage("Views", "user");
            const table = createTable(project.ydoc, "Records", "records");
            const grid = createGrid(project.ydoc, {
                query: "SELECT * FROM records",
                insertTargetTableId: table,
                columnOrder: ["id"],
                components: { id: { label: "Destination", widthPx: 180 } },
                showAddRowButton: false,
                confirmRowDelete: true,
            });
            const original = getGridHandles(project.ydoc, grid)!.entry;
            if (provenance) {
                original.set("copiedFromProjectId", "source-project");
                original.set("copiedFromGridId", "source-grid");
            }
            const placement = appendGridPlacement(project.ydoc, page.id, grid, "user");
            const id = placement.id;
            const before = original.toJSON();
            const evidence = new TransferBindings(project.ydoc);
            evidence.capture("grid", grid, true);
            globalUndoRouter.clear();
            expect(removeGridWithPlacements(project, grid)).toBe(true);
            expect(getGridHandles(project.ydoc, grid)).toBeUndefined();
            expect(placement.yjsGridId).toBeUndefined();
            for (let cycle = 0; cycle < 2; cycle++) {
                globalUndoRouter.undo();
                const restored = getGridHandles(project.ydoc, grid)!.entry;
                expect(restored).not.toBe(original);
                expect(restored.toJSON()).toEqual(before);
                expect(placement.id).toBe(id);
                expect(placement.yjsGridId).toBe(grid);
                expect(() => evidence.assertOwned()).toThrow("newer incarnation");
                if (!provenance) {
                    expect(restored.has("copiedFromProjectId")).toBe(false);
                    expect(restored.has("copiedFromGridId")).toBe(false);
                }
                if (cycle === 0) globalUndoRouter.redo();
            }
            const duplicate = duplicateGrid(project.ydoc, grid)!;
            expect(duplicate).not.toBe(grid);
            const copied = getGridHandles(project.ydoc, duplicate)!.entry;
            expect(copied.has("copiedFromProjectId")).toBe(false);
            expect(copied.has("copiedFromGridId")).toBe(false);
            expect(copied.get("query")).toBe(before.query);
            expect(listTables(project.ydoc).map(t => t.tableId)).toEqual([table]);
        });
    }

    it("rejects an implicit output alias without changing the saved query", () => {
        const doc = new Y.Doc();
        const gridId = createGrid(doc, { query: "SELECT value FROM table1" });
        const grid = getGridHandles(doc, gridId)!;

        expect(() => setGridQuery(grid, "SELECT value v FROM table1")).toThrow(/explicit AS/);
        expect(getGridQuery(grid)).toBe("SELECT value FROM table1");
    });

    it("creates one project-level Grid entry per Grid, referencing its source Table", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Tasks", "tasks");

        const gridId = createGrid(projectDoc, {
            name: "Open tasks",
            query: "SELECT id, title FROM tasks WHERE status = 'open'",
        });

        expect(listGrids(projectDoc)).toEqual([
            { gridId, name: "Open tasks", showAddRowButton: true, confirmRowDelete: false },
        ]);
        expect(getGridRegistry(projectDoc).get(gridId)?.get("sourceTableId")).toBeUndefined();
    });

    it("supports one Table with many independent Grids", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Tasks", "tasks");

        const openGridId = createGrid(projectDoc, {
            name: "Open",
            query: "SELECT id, title FROM tasks WHERE status = 'open'",
            columnOrder: ["title", "id"],
        });
        const mineGridId = createGrid(projectDoc, {
            name: "Mine",
            query: "SELECT id, title FROM tasks WHERE assignee = 'me'",
            columnOrder: ["id", "title"],
        });

        // Both point at the same Table without cloning it.
        expect(getGridRegistry(projectDoc).get(openGridId)?.get("sourceTableId")).toBeUndefined();
        expect(getGridRegistry(projectDoc).get(mineGridId)?.get("sourceTableId")).toBeUndefined();
        expect(listTables(projectDoc)).toHaveLength(1);

        // Grid A's query changes do not touch Grid B.
        const openHandles = getGridHandles(projectDoc, openGridId)!;
        setGridQuery(openHandles, "SELECT id FROM tasks WHERE status = 'open' ORDER BY id");
        const mineHandles = getGridHandles(projectDoc, mineGridId)!;
        expect(getGridQuery(mineHandles)).toBe("SELECT id, title FROM tasks WHERE assignee = 'me'");

        // Column order edits stay per-Grid.
        setGridColumnOrder(openHandles, ["title"]);
        expect(getGridColumnOrder(mineHandles)).toEqual(["id", "title"]);
    });

    it("keeps per-column UI settings scoped to the Grid that owns them", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Tasks", "tasks");
        const a = createGrid(projectDoc, { name: "A", query: "SELECT * FROM tasks" });
        const b = createGrid(projectDoc, { name: "B", query: "SELECT * FROM tasks" });

        setGridComponentField(getGridHandles(projectDoc, a)!, "title", "label", "Title-A");
        setGridComponentField(getGridHandles(projectDoc, a)!, "status", "hidden", true);
        setGridComponentField(getGridHandles(projectDoc, b)!, "title", "type", "text");

        const settingsA = readGridComponents(getGridHandles(projectDoc, a)!);
        const settingsB = readGridComponents(getGridHandles(projectDoc, b)!);
        expect(settingsA.labels.title).toBe("Title-A");
        expect(settingsA.hidden.status).toBe(true);
        expect(settingsB.labels.title).toBeUndefined();
        expect(settingsB.hidden.status).toBeUndefined();
        expect(settingsB.types.title).toBe("text");
    });

    it("duplicates only the Grid definition and shares the underlying Table", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const originalId = createGrid(projectDoc, {
            name: "Original",
            query: "SELECT id FROM tasks",
            columnOrder: ["id"],
            components: { id: { type: "text", label: "Id", hidden: false } },
        });

        const dupId = duplicateGrid(projectDoc, originalId)!;
        expect(dupId).not.toBe(originalId);

        const dupHandles = getGridHandles(projectDoc, dupId)!;
        expect(getGridRegistry(projectDoc).get(dupId)?.get("sourceTableId")).toBeUndefined();
        expect(findGridsByTableDependency(projectDoc, tableId).map(grid => grid.gridId).sort())
            .toEqual([originalId, dupId].sort());
        expect(getGridQuery(dupHandles)).toBe("SELECT id FROM tasks");
        expect(getGridColumnOrder(dupHandles)).toEqual(["id"]);
        expect(readGridComponents(dupHandles).labels.id).toBe("Id");
        expect(listTables(projectDoc)).toHaveLength(1);
    });

    it("preserves showAddRowButton flag on duplicateGrid", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Tasks", "tasks");

        const originalId = createGrid(projectDoc, {
            name: "Original",
            showAddRowButton: false,
        });

        const dupId = duplicateGrid(projectDoc, originalId)!;
        const dupHandles = getGridHandles(projectDoc, dupId)!;
        expect(dupHandles.entry.get("showAddRowButton")).toBe(false);
    });

    it("sets and gets confirmRowDelete correctly", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Tasks", "tasks");

        // Test default creation
        const gridId = createGrid(projectDoc, { name: "G" });
        const handles = getGridHandles(projectDoc, gridId)!;

        expect(getGridConfirmRowDelete(handles)).toBe(false);

        // Test toggling true
        setGridConfirmRowDelete(handles, true);
        expect(getGridConfirmRowDelete(handles)).toBe(true);
        expect(handles.entry.get("confirmRowDelete")).toBe(true);

        // Test toggling false (removes the key)
        setGridConfirmRowDelete(handles, false);
        expect(getGridConfirmRowDelete(handles)).toBe(false);
        expect(handles.entry.get("confirmRowDelete")).toBeUndefined();
    });

    it("preserves confirmRowDelete flag on duplicateGrid", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Tasks", "tasks");

        const originalId = createGrid(projectDoc, {
            name: "Original",
            confirmRowDelete: true,
        });

        const dupId = duplicateGrid(projectDoc, originalId)!;
        const dupHandles = getGridHandles(projectDoc, dupId)!;
        expect(getGridConfirmRowDelete(dupHandles)).toBe(true);
    });

    it("sets and gets showAddRowButton correctly", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Tasks", "tasks");
        const gridId = createGrid(projectDoc, { name: "G" });
        const handles = getGridHandles(projectDoc, gridId)!;

        // Default is true
        expect(handles.entry.get("showAddRowButton")).toBeUndefined();

        // Update to false
        handles.projectDoc.transact(() => {
            handles.entry.set("showAddRowButton", false);
        });
        expect(handles.entry.get("showAddRowButton")).toBe(false);

        // Update back to true deletes the field
        handles.projectDoc.transact(() => {
            handles.entry.delete("showAddRowButton");
        });
        expect(handles.entry.get("showAddRowButton")).toBeUndefined();
    });

    it("undo/redo covers only the Grid definition, not the source Table data", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const gridId = createGrid(projectDoc, { name: "G", query: "SELECT 1" });
        const grid = getGridHandles(projectDoc, gridId)!;
        const table = getTableHandles(projectDoc, tableId)!;

        // Stopping capture ensures the initial fixture writes are not part of
        // the tracked group we are about to make.
        grid.undo.stopCapturing();
        table.undo.stopCapturing();

        setGridQuery(grid, "SELECT id FROM tasks");
        expect(getGridQuery(grid)).toBe("SELECT id FROM tasks");
        grid.undo.undo();
        expect(getGridQuery(grid)).toBe("SELECT 1");
    });

    it("lists Grids by their SQL dependencies", () => {
        const projectDoc = new Y.Doc();
        const tasksId = createTable(projectDoc, "Tasks", "tasks");
        const notesId = createTable(projectDoc, "Notes", "notes");
        const g1 = createGrid(projectDoc, { name: "G1", query: "SELECT * FROM tasks" });
        const g2 = createGrid(projectDoc, { name: "G2", query: "SELECT * FROM tasks" });
        createGrid(projectDoc, { name: "G3", query: "SELECT * FROM notes" });

        expect(findGridsByTableDependency(projectDoc, tasksId).map(g => g.gridId).sort()).toEqual([g1, g2].sort());
        expect(findGridsByTableDependency(projectDoc, notesId)).toHaveLength(1);
    });

    it("removes a Grid without touching the Table it referenced", () => {
        const projectDoc = new Y.Doc();
        createTable(projectDoc, "Tasks", "tasks");
        const gridId = createGrid(projectDoc, { name: "G" });
        expect(removeGrid(projectDoc, gridId)).toBe(true);
        expect(listGrids(projectDoc)).toEqual([]);
        // Table stays intact for other Grids or later reuse.
        expect(listTables(projectDoc)).toHaveLength(1);
    });
});

// A Grid is only ever created by an explicit user action. The bridge that used
// to resolve-or-create one for a Table-addressed surface (`ensureGridForTable`)
// is gone: a Table is viewable and editable with zero Grids (issue #5012).
describe("Grid creation is explicit", () => {
    it("exposes no resolve-or-create helper that could convert a Table into a Grid", async () => {
        const gridDocs = await import("./gridDocs");
        expect("ensureGridForTable" in gridDocs).toBe(false);
    });

    it("reports zero Grids for a Table nobody built one over", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Tasks", "tasks");

        expect(findGridsByTableDependency(projectDoc, tableId)).toHaveLength(0);
        expect(listGrids(projectDoc)).toHaveLength(0);
    });
});
