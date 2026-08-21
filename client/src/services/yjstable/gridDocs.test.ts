import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    createGrid,
    duplicateGrid,
    findGridsBySourceTable,
    getGridColumnOrder,
    getGridHandles,
    getGridQuery,
    getGridSourceTableId,
    listGrids,
    readGridComponents,
    removeGrid,
    setGridColumnOrder,
    setGridComponentField,
    setGridQuery,
} from "./gridDocs";
import { createTable, getTableHandles, listTables } from "./tableDocs";

describe("Grid registry", () => {
    it("creates one project-level Grid entry per Grid, referencing its source Table", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Tasks", "tasks");

        const gridId = createGrid(projectDoc, tableId, {
            name: "Open tasks",
            query: "SELECT id, title FROM tasks WHERE status = 'open'",
        });

        expect(listGrids(projectDoc)).toEqual([
            { gridId, name: "Open tasks", sourceTableId: tableId },
        ]);
        expect(getGridSourceTableId(projectDoc, gridId)).toBe(tableId);
    });

    it("supports one Table with many independent Grids", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Tasks", "tasks");

        const openGridId = createGrid(projectDoc, tableId, {
            name: "Open",
            query: "SELECT id, title FROM tasks WHERE status = 'open'",
            columnOrder: ["title", "id"],
        });
        const mineGridId = createGrid(projectDoc, tableId, {
            name: "Mine",
            query: "SELECT id, title FROM tasks WHERE assignee = 'me'",
            columnOrder: ["id", "title"],
        });

        // Both point at the same Table without cloning it.
        expect(getGridSourceTableId(projectDoc, openGridId)).toBe(tableId);
        expect(getGridSourceTableId(projectDoc, mineGridId)).toBe(tableId);
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
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const a = createGrid(projectDoc, tableId, { name: "A", query: "SELECT * FROM tasks" });
        const b = createGrid(projectDoc, tableId, { name: "B", query: "SELECT * FROM tasks" });

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
        const originalId = createGrid(projectDoc, tableId, {
            name: "Original",
            query: "SELECT id FROM tasks",
            columnOrder: ["id"],
            components: { id: { type: "text", label: "Id", hidden: false } },
        });

        const dupId = duplicateGrid(projectDoc, originalId)!;
        expect(dupId).not.toBe(originalId);

        const dupHandles = getGridHandles(projectDoc, dupId)!;
        expect(getGridSourceTableId(projectDoc, dupId)).toBe(tableId);
        expect(getGridQuery(dupHandles)).toBe("SELECT id FROM tasks");
        expect(getGridColumnOrder(dupHandles)).toEqual(["id"]);
        expect(readGridComponents(dupHandles).labels.id).toBe("Id");
        expect(listTables(projectDoc)).toHaveLength(1);
    });

    it("undo/redo covers only the Grid definition, not the source Table data", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const gridId = createGrid(projectDoc, tableId, { name: "G", query: "SELECT 1" });
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

    it("lists Grids by their source Table", () => {
        const projectDoc = new Y.Doc();
        const tasksId = createTable(projectDoc, "Tasks", "tasks");
        const notesId = createTable(projectDoc, "Notes", "notes");
        const g1 = createGrid(projectDoc, tasksId, { name: "G1" });
        const g2 = createGrid(projectDoc, tasksId, { name: "G2" });
        createGrid(projectDoc, notesId, { name: "G3" });

        expect(findGridsBySourceTable(projectDoc, tasksId).map(g => g.gridId).sort()).toEqual([g1, g2].sort());
        expect(findGridsBySourceTable(projectDoc, notesId)).toHaveLength(1);
    });

    it("removes a Grid without touching the Table it referenced", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const gridId = createGrid(projectDoc, tableId, { name: "G" });
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

        expect(findGridsBySourceTable(projectDoc, tableId)).toHaveLength(0);
        expect(listGrids(projectDoc)).toHaveLength(0);
    });
});
