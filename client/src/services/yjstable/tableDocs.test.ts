import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    addRecord,
    createTable,
    deleteColumnData,
    deleteRecord,
    findSqlNameConflict,
    findTableIdBySqlName,
    getTableHandles,
    getTableRegistry,
    getTableSqlName,
    listTables,
    renameTable,
    setRecordValue,
    setSchemaText,
    setTableSqlName,
    tableDocGuid,
} from "./tableDocs";

describe("table registry (project doc)", () => {
    it("creates one subdoc per table and registers it with a display name", () => {
        const projectDoc = new Y.Doc({ guid: "proj-1" });
        const tableId = createTable(projectDoc, "Tasks", "tasks");

        expect(listTables(projectDoc)).toEqual([{ tableId, name: "Tasks", sqlName: "tasks" }]);
        const entry = getTableRegistry(projectDoc).get(tableId);
        const subdoc = entry?.get("doc");
        expect(subdoc).toBeInstanceOf(Y.Doc);
        expect((subdoc as Y.Doc).guid).toBe(tableDocGuid("proj-1", tableId));
        // The subdoc is a real Yjs subdocument of the project doc.
        expect([...projectDoc.getSubdocs()]).toContain(subdoc);
    });

    it("renames tables through the registry entry", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Old", "old_table");
        renameTable(projectDoc, tableId, "New");
        expect(listTables(projectDoc)[0].name).toBe("New");
        // The label is not the identifier: queries written against the SQL
        // name keep working after a rename.
        expect(listTables(projectDoc)[0].sqlName).toBe("old_table");
    });
});

describe("SQL names in the registry", () => {
    it("resolves a relation name used in a query to its table", () => {
        const projectDoc = new Y.Doc();
        const salesId = createTable(projectDoc, "売上管理", "sales");
        createTable(projectDoc, "顧客", "customers");

        expect(findTableIdBySqlName(projectDoc, "sales")).toBe(salesId);
        expect(findTableIdBySqlName(projectDoc, "unknown")).toBeUndefined();
    });

    it("reports a conflict when another table already uses the name", () => {
        const projectDoc = new Y.Doc();
        const first = createTable(projectDoc, "Sales 2025", "sales");
        const second = createTable(projectDoc, "Sales 2026", "sales_2026");

        expect(findSqlNameConflict(projectDoc, second, "sales")).toMatch(/Sales 2025/);
        // A table never conflicts with itself, and free names are accepted.
        expect(findSqlNameConflict(projectDoc, first, "sales")).toBeUndefined();
        expect(findSqlNameConflict(projectDoc, second, "sales_2027")).toBeUndefined();
    });

    it("records the applied schema's identifier", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Sales", "sales");
        setTableSqlName(projectDoc, tableId, "revenue");
        expect(getTableSqlName(projectDoc, tableId)).toBe("revenue");
        expect(findTableIdBySqlName(projectDoc, "revenue")).toBe(tableId);
        expect(findTableIdBySqlName(projectDoc, "sales")).toBeUndefined();
    });
});

describe("table handles", () => {
    it("exposes the three structures and an undo manager spanning them", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "T", "t");
        const handles = getTableHandles(projectDoc, tableId)!;

        setSchemaText(handles, "CREATE TABLE t (id TEXT PRIMARY KEY, title TEXT)");
        expect(handles.schemaText.toString()).toContain("CREATE TABLE");

        handles.uiDef.set("query", "SELECT id, title FROM t");
        const recordId = addRecord(handles, { title: "hello" });
        expect(handles.data.get(recordId)?.get("title")).toBe("hello");
        expect(handles.data.get(recordId)?.get("id")).toBe(recordId);

        // Undo the record insert, then the ui change, then the schema change.
        handles.undo.undo();
        expect(handles.data.size).toBe(0);
        handles.undo.undo();
        expect(handles.uiDef.get("query")).toBeUndefined();
        handles.undo.undo();
        expect(handles.schemaText.toString()).toBe("");
    });

    it("stores records as nested Y.Map for field-level merges", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "T", "t");
        const handles = getTableHandles(projectDoc, tableId)!;
        const recordId = addRecord(handles, { a: "1", b: "2" });
        expect(handles.data.get(recordId)).toBeInstanceOf(Y.Map);

        setRecordValue(handles, recordId, "a", "changed");
        expect(handles.data.get(recordId)?.get("a")).toBe("changed");
        expect(handles.data.get(recordId)?.get("b")).toBe("2");

        deleteRecord(handles, recordId);
        expect(handles.data.size).toBe(0);
    });

    it("deletes dropped-column data from every record", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "T", "t");
        const handles = getTableHandles(projectDoc, tableId)!;
        const r1 = addRecord(handles, { keep: "a", drop: "x" });
        const r2 = addRecord(handles, { keep: "b", drop: "y" });

        deleteColumnData(handles, ["drop"]);
        expect(handles.data.get(r1)?.has("drop")).toBe(false);
        expect(handles.data.get(r2)?.has("drop")).toBe(false);
        expect(handles.data.get(r1)?.get("keep")).toBe("a");
    });

    it("returns undefined for unknown table ids", () => {
        const projectDoc = new Y.Doc();
        expect(getTableHandles(projectDoc, "nope")).toBeUndefined();
    });

    it("memoizes UndoManager so repeated getTableHandles calls share the same instance", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "T", "t");
        const handles1 = getTableHandles(projectDoc, tableId)!;

        setSchemaText(handles1, "CREATE TABLE t (id TEXT)");

        const handles2 = getTableHandles(projectDoc, tableId)!;
        expect(handles1.undo).toBe(handles2.undo);

        // Assert the edit made before the second call is still undoable
        handles2.undo.undo();
        expect(handles2.schemaText.toString()).toBe("");
    });
});
