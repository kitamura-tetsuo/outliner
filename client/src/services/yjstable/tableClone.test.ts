import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, getGridRegistry } from "./gridDocs";
import { resetPgliteForTests } from "./pgliteService";
import {
    computeSnapshotClosure,
    computeTableClosure,
    copyTableData,
    exportGridSlice,
    exportTableStructure,
    exportTableStructures,
    importTableStructures,
} from "./tableClone";
import { addRecord, createTable, getTableHandles, listTables } from "./tableDocs";

function fixture() {
    const doc = new Y.Doc({ guid: "source-project" });
    const a = createTable(
        doc,
        "A",
        "a",
        undefined,
        handles => handles.schemaText.insert(0, "CREATE TABLE a (id TEXT PRIMARY KEY)"),
    );
    const b = createTable(
        doc,
        "B",
        "b",
        undefined,
        handles => handles.schemaText.insert(0, "CREATE TABLE b (id TEXT PRIMARY KEY)"),
    );
    const c = createTable(
        doc,
        "Unused",
        "c",
        undefined,
        handles => handles.schemaText.insert(0, "CREATE TABLE c (id TEXT PRIMARY KEY)"),
    );
    const grid = createGrid(doc, {
        name: "Joined",
        query: "SELECT a.id FROM a WHERE EXISTS (SELECT 1 FROM b)",
        insertTargetTableId: b,
        columnOrder: ["id"],
        components: { id: { label: "Identity", widthPx: 180 } },
        showAddRowButton: false,
        confirmRowDelete: true,
    });
    const other = createGrid(doc, { name: "Other", query: "SELECT id FROM a", insertTargetTableId: c });
    addRecord(getTableHandles(doc, a)!, { id: "record" }, "record");
    return { doc, a, b, c, grid, other };
}

afterAll(resetPgliteForTests);

describe("independent portable Tables and Grids", () => {
    it("exports independent definitions and exact SQL read identities, never records or primary fields", () => {
        const f = fixture();
        const table = exportTableStructure(f.doc, f.a);
        expect(table).toMatchObject({
            sourceTableId: f.a,
            sqlName: "a",
            schemaSql: "CREATE TABLE a (id TEXT PRIMARY KEY)",
        });
        expect(table).not.toHaveProperty("ui");
        expect(table).not.toHaveProperty("data");
        const grid = exportGridSlice(f.doc, f.grid);
        expect(grid.tableIds).toEqual([f.a, f.b]);
        expect(grid.insertTargetTableId).toBe(f.b);
        expect(grid).not.toHaveProperty("sourceTableId");
        expect(exportGridSlice(f.doc, f.other).tableIds).toEqual([f.a]);
        expect(Object.keys(exportTableStructures(f.doc, [f.a, f.a]))).toEqual([f.a]);
        expect([...computeTableClosure(f.doc, [f.a])]).toEqual([f.a]);
        expect([...computeSnapshotClosure({ [f.a]: table }, [f.a])]).toEqual([f.a]);
    });

    it("imports two Grids over one copied Table without synthesizing extra definitions", async () => {
        const f = fixture();
        const destination = new Y.Doc({ guid: "destination" });
        createTable(destination, "Coincident", "a");
        const result = await importTableStructures(
            destination,
            exportTableStructures(f.doc, [f.a, f.b]),
            f.doc.guid,
            new Set([f.a]),
            false,
            { [f.grid]: exportGridSlice(f.doc, f.grid), [f.other]: exportGridSlice(f.doc, f.other) },
        );
        expect(result.failures).toEqual({});
        expect(Object.keys(result.gridIdMap).sort()).toEqual([f.grid, f.other].sort());
        expect(getGridRegistry(destination).size).toBe(2);
        const copied = getGridHandles(destination, result.gridIdMap[f.grid])!;
        expect(copied.entry.has("sourceTableId")).toBe(false);
        expect(copied.entry.get("query")).toBe("SELECT a_2.id FROM a_2 WHERE EXISTS (SELECT 1 FROM b)");
        expect(copied.entry.get("insertTargetTableId")).toBe(result.tableIdMap[f.b]);
        expect(copied.entry.get("showAddRowButton")).toBe(false);
        expect(copied.entry.get("confirmRowDelete")).toBe(true);
        expect(copied.components.get("id")?.get("widthPx")).toBe(180);
        expect(getGridHandles(destination, result.gridIdMap[f.other])?.entry.has("insertTargetTableId")).toBe(false);
        expect(result.tableIdMap[f.c]).toBeUndefined();
        expect(getTableHandles(destination, result.tableIdMap[f.a])?.data.size).toBe(0);
        expect(result.outcomes).toContainEqual({
            type: "view-omission",
            gridId: f.other,
            reason: `Cleared unmappable INSERT preference ${f.c}`,
        });
    });

    it("does not bind omitted dependencies to same-named destination Tables", async () => {
        const f = fixture();
        const destination = new Y.Doc({ guid: "destination" });
        const coincident = createTable(destination, "B", "b");
        const result = await importTableStructures(
            destination,
            exportTableStructures(f.doc, [f.a]),
            f.doc.guid,
            undefined,
            false,
            { [f.grid]: exportGridSlice(f.doc, f.grid) },
        );
        const grid = getGridHandles(destination, result.gridIdMap[f.grid])!;
        expect(grid.entry.get("query")).toBe("");
        expect(grid.entry.has("insertTargetTableId")).toBe(false);
        expect(result.tableIdMap[f.b]).toBeUndefined();
        expect(result.outcomes.filter(outcome => outcome.type === "view-omission")).toHaveLength(2);
        expect(getTableHandles(destination, coincident)?.data.size).toBe(0);
    });

    it("preserves omitted same-Project references and stale preferences", async () => {
        const f = fixture();
        const result = await importTableStructures(
            f.doc,
            exportTableStructures(f.doc, [f.a]),
            f.doc.guid,
            undefined,
            false,
            { [f.grid]: exportGridSlice(f.doc, f.grid), [f.other]: exportGridSlice(f.doc, f.other) },
        );
        expect(getGridHandles(f.doc, result.gridIdMap[f.grid])?.entry.get("query")).toBe(
            "SELECT a_2.id FROM a_2 WHERE EXISTS (SELECT 1 FROM b)",
        );
        expect(getGridHandles(f.doc, result.gridIdMap[f.grid])?.entry.get("insertTargetTableId")).toBe(f.b);
        expect(getGridHandles(f.doc, result.gridIdMap[f.other])?.entry.get("insertTargetTableId")).toBe(f.c);
    });

    it("reuses by source view identity without overwriting newer destination settings; independent repeats are fresh", async () => {
        const f = fixture();
        const destination = new Y.Doc({ guid: "destination" });
        const tables = exportTableStructures(f.doc, [f.a, f.b]);
        const grids = { [f.grid]: exportGridSlice(f.doc, f.grid) };
        const first = await importTableStructures(destination, tables, f.doc.guid, undefined, true, grids);
        getGridHandles(destination, first.gridIdMap[f.grid])!.entry.set("query", "SELECT 42 AS peer");
        const second = await importTableStructures(destination, tables, f.doc.guid, undefined, true, grids);
        expect(second.tableIdMap).toEqual({});
        expect(second.reusedTableIdMap).toEqual(first.tableIdMap);
        expect(second.reusedGridIdMap).toEqual(first.gridIdMap);
        expect(getGridHandles(destination, second.reusedGridIdMap[f.grid])?.entry.get("query")).toBe(
            "SELECT 42 AS peer",
        );
        const independent = await importTableStructures(destination, tables, f.doc.guid, undefined, false, grids);
        expect(independent.gridIdMap[f.grid]).not.toBe(first.gridIdMap[f.grid]);
        expect(independent.tableIdMap[f.a]).not.toBe(first.tableIdMap[f.a]);
    });

    it("imports dependency-free/system queries with zero Tables and rejects unknown automatic evidence", async () => {
        const doc = new Y.Doc();
        const destination = new Y.Doc();
        const id = createGrid(doc, { query: "SELECT 1 AS value" });
        const result = await importTableStructures(destination, {}, doc.guid, undefined, false, {
            [id]: exportGridSlice(doc, id),
        });
        expect(result.tableIdMap).toEqual({});
        expect(listTables(destination)).toEqual([]);
        expect(getGridHandles(destination, result.gridIdMap[id])?.entry.get("query")).toBe("SELECT 1 AS value");
        getGridHandles(doc, id)!.entry.set("query", "SELECT * FROM");
        expect(() => exportGridSlice(doc, id)).toThrow("unknown read dependencies");
        expect(() => computeSnapshotClosure({}, ["missing"])).toThrow("unavailable");
    });

    it("rejects invalid schema groups without losing independent valid Tables", async () => {
        const f = fixture();
        const snapshots = exportTableStructures(f.doc, [f.a, f.b, f.c]);
        snapshots[f.b]!.schemaSql = "CREATE TABLE wrong_name (id TEXT)";
        const destination = new Y.Doc();
        const result = await importTableStructures(destination, snapshots, f.doc.guid, undefined, false, {
            [f.grid]: exportGridSlice(f.doc, f.grid),
        });
        expect(result.tableIdMap[f.a]).toBeUndefined();
        expect(result.tableIdMap[f.b]).toBeUndefined();
        expect(result.tableIdMap[f.c]).toBeDefined();
        expect(result.failedSourceTableIds.sort()).toEqual([f.a, f.b].sort());
    });

    it("copies live rows independently and clears destination rows for a successful empty source", () => {
        const f = fixture();
        const destination = getTableHandles(f.doc, f.b)!;
        const source = getTableHandles(f.doc, f.a)!;
        copyTableData(source, destination);
        expect(destination.data.toJSON()).toEqual(source.data.toJSON());
        expect(destination.data.get("record")).not.toBe(source.data.get("record"));
        source.data.get("record")!.set("id", "peer");
        expect(destination.data.get("record")!.get("id")).toBe("record");
        copyTableData(getTableHandles(f.doc, f.c)!, destination);
        expect(destination.data.size).toBe(0);
    });
});
