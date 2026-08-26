import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridColumnOrder, getGridHandles, getGridSourceTableId, listGrids } from "./gridDocs";
import { duplicateObjects, previewObjectDuplication } from "./objectDuplication";
import { addRecord, createTable, getTableHandles, listTables } from "./tableDocs";

function table(doc: Y.Doc, name: string, sqlName: string): string {
    return createTable(doc, name, sqlName, handles => {
        handles.schemaText.insert(0, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, title TEXT)`);
    });
}

describe("dependency-aware Grid/Table duplication", () => {
    it("collects recursively and deduplicates a shared Table", () => {
        const doc = new Y.Doc();
        const tableId = table(doc, "Tasks", "tasks");
        const first = createGrid(doc, tableId, { name: "First" });
        createGrid(doc, tableId, { name: "Second" });

        const referenced = previewObjectDuplication(doc, { type: "grid", id: first }, "referenced");
        expect(referenced.objects).toEqual([
            { type: "grid", id: first },
            { type: "table", id: tableId },
        ]);
        const connected = previewObjectDuplication(doc, { type: "grid", id: first }, "connected");
        expect(connected.objects.filter(object => object.type === "table")).toHaveLength(1);
        expect(connected.objects.filter(object => object.type === "grid")).toHaveLength(2);
    });

    it("warns when a Grid's explicit Table reference is omitted", () => {
        const doc = new Y.Doc();
        const tableId = table(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId);
        expect(previewObjectDuplication(doc, { type: "grid", id: gridId }, "item-only").omittedReferenceCount)
            .toBe(1);
    });

    it("collects and rewrites every Table relation referenced by a Grid query", () => {
        const doc = new Y.Doc();
        const tasks = table(doc, "Tasks", "tasks");
        const owners = table(doc, "Owners", "owners");
        const gridId = createGrid(doc, tasks, {
            query: "SELECT tasks.id FROM tasks JOIN owners ON owners.id = tasks.id",
        });

        const preview = previewObjectDuplication(doc, { type: "grid", id: gridId }, "referenced");
        expect(preview.objects).toEqual([
            { type: "grid", id: gridId },
            { type: "table", id: tasks },
            { type: "table", id: owners },
        ]);
        const result = duplicateObjects(doc, doc, { type: "grid", id: gridId }, "referenced");
        const query = String(getGridHandles(doc, result.primaryId)?.entry.get("query"));
        expect(query).toContain("FROM tasks_2 JOIN owners_2");
    });

    it("counts and clears omitted query relations in a cross-project copy", () => {
        const source = new Y.Doc();
        const tasks = table(source, "Tasks", "tasks");
        table(source, "Owners", "owners");
        const gridId = createGrid(source, tasks, { query: "SELECT * FROM tasks JOIN owners USING (id)" });
        expect(previewObjectDuplication(source, { type: "grid", id: gridId }, "item-only").omittedReferenceCount)
            .toBe(2);

        const destination = new Y.Doc();
        const result = duplicateObjects(source, destination, { type: "grid", id: gridId }, "item-only");
        expect(getGridHandles(destination, result.primaryId)?.entry.get("query")).toBe("");
        expect(result.removedReferenceCount).toBe(3);
    });

    it("preserves a Y.Array-backed Grid column order", () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");
        const gridId = createGrid(source, tableId, { columnOrder: ["title", "id"] });
        const handles = getGridHandles(source, gridId)!;
        handles.entry.set("columnOrder", Y.Array.from(["id", "title"]));

        const result = duplicateObjects(source, source, { type: "grid", id: gridId }, "item-only");
        expect(getGridColumnOrder(getGridHandles(source, result.primaryId)!)).toEqual(["id", "title"]);
    });

    it("keeps an omitted reference in-project and clears it cross-project", () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");
        const gridId = createGrid(source, tableId);
        const local = duplicateObjects(source, source, { type: "grid", id: gridId }, "item-only");
        expect(getGridSourceTableId(source, local.primaryId)).toBe(tableId);

        const destination = new Y.Doc();
        const remote = duplicateObjects(source, destination, { type: "grid", id: gridId }, "item-only");
        expect(getGridSourceTableId(destination, remote.primaryId)).toBeUndefined();
        expect(remote.removedReferenceCount).toBe(1);
    });

    it("rewrites shared references and assigns collision-safe names", () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");
        const first = createGrid(source, tableId, { name: "Board" });
        createGrid(source, tableId, { name: "Board copy" });
        const result = duplicateObjects(source, source, { type: "grid", id: first }, "connected");
        const copiedTableId = result.idMap.get(`table:${tableId}`)!;
        const copiedGridIds = [...result.idMap].filter(([id]) => id.startsWith("grid:")).map(([, id]) => id);
        expect(copiedGridIds.map(id => getGridSourceTableId(source, id))).toEqual([copiedTableId, copiedTableId]);
        expect(listTables(source).map(entry => entry.name)).toContain("Tasks copy");
        expect(listGrids(source).map(entry => entry.name)).toContain("Board copy 2");
    });

    it("copies Table structure without rows by default and rows when requested", () => {
        const source = new Y.Doc();
        const tableId = table(source, "Tasks", "tasks");
        addRecord(getTableHandles(source, tableId)!, { title: "one" }, "row-1");

        const withoutRows = new Y.Doc();
        const structure = duplicateObjects(source, withoutRows, { type: "table", id: tableId }, "item-only");
        expect(getTableHandles(withoutRows, structure.primaryId)?.data.size).toBe(0);

        const withRows = new Y.Doc();
        const data = duplicateObjects(source, withRows, { type: "table", id: tableId }, "item-only", {
            copyTableData: true,
        });
        expect(getTableHandles(withRows, data.primaryId)?.data.get("row-1")?.get("title")).toBe("one");
    });
});
