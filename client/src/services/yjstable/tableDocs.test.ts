import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    addRecord,
    createTable,
    deleteColumnData,
    deleteRecord,
    getTableHandles,
    getTableRegistry,
    listTables,
    renameTable,
    setRecordValue,
    setSchemaText,
    tableDocGuid,
} from "./tableDocs";

describe("table registry (project doc)", () => {
    it("creates one subdoc per table and registers it with a display name", () => {
        const projectDoc = new Y.Doc({ guid: "proj-1" });
        const tableId = createTable(projectDoc, "Tasks");

        expect(listTables(projectDoc)).toEqual([{ tableId, name: "Tasks" }]);
        const entry = getTableRegistry(projectDoc).get(tableId);
        const subdoc = entry?.get("doc");
        expect(subdoc).toBeInstanceOf(Y.Doc);
        expect((subdoc as Y.Doc).guid).toBe(tableDocGuid("proj-1", tableId));
        // The subdoc is a real Yjs subdocument of the project doc.
        expect([...projectDoc.getSubdocs()]).toContain(subdoc);
    });

    it("renames tables through the registry entry", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "Old");
        renameTable(projectDoc, tableId, "New");
        expect(listTables(projectDoc)[0].name).toBe("New");
    });
});

describe("table handles", () => {
    it("exposes the three structures and an undo manager spanning them", () => {
        const projectDoc = new Y.Doc();
        const tableId = createTable(projectDoc, "T");
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
        const tableId = createTable(projectDoc, "T");
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
        const tableId = createTable(projectDoc, "T");
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
});
