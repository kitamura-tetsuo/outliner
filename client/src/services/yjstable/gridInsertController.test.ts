import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "./gridDocs";
import { createGridInsertController } from "./gridInsertController";
import { resetPgliteForTests } from "./pgliteService";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} });

function table(doc: Y.Doc, sqlName: string, schema: string) {
    const id = createTable(doc, sqlName.toUpperCase(), sqlName);
    const handles = getTableHandles(doc, id)!;
    setSchemaText(handles, schema);
    return { id, handles };
}

function controller(doc: Y.Doc, query: string) {
    const gridId = createGrid(doc, undefined, { query });
    const grid = getGridHandles(doc, gridId)!;
    return {
        grid,
        value: createGridInsertController({ projectDoc: doc, gridEntry: grid.entry, query, connect }),
    };
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid INSERT controller", { timeout: 30_000 }, () => {
    it("inserts once into the sole proven supplier with its physical defaults", async () => {
        const doc = new Y.Doc({ guid: "grid-insert-sole" });
        const a = table(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, note TEXT)");
        const b = table(
            doc,
            "b",
            "CREATE TABLE b (id TEXT PRIMARY KEY, title TEXT DEFAULT 'Draft' NOT NULL, done BOOLEAN NOT NULL, status TEXT CHECK (status IN ('Open', 'Done')))",
        );
        const run = controller(doc, "SELECT title AS label FROM b WHERE false");
        try {
            const [first, duplicate] = await Promise.all([run.value.submit(), run.value.submit()]);
            expect(first).toEqual({
                status: "inserted",
                targetId: b.id,
                targetSqlName: "b",
                rowId: expect.any(String),
                visibility: "pending",
            });
            expect(duplicate).toEqual(first);
            expect(a.handles.data.size).toBe(0);
            expect(b.handles.data.size).toBe(1);
            expect([...b.handles.data.values()][0]!.toJSON()).toMatchObject({
                title: "Draft",
                done: false,
                status: "Open",
            });
            expect(run.grid.entry.has("insertTargetTableId")).toBe(false);
            b.handles.undo.undo();
            expect(b.handles.data.size).toBe(0);
            b.handles.undo.redo();
            expect(b.handles.data.size).toBe(1);
        } finally {
            run.value.dispose();
        }
    });

    it("refuses an ambiguous UNION and accepts only a current supplier preference", async () => {
        const doc = new Y.Doc({ guid: "grid-insert-union" });
        const a = table(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
        const b = table(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value INTEGER DEFAULT 7)");
        const query = "SELECT * FROM a WHERE false UNION ALL SELECT * FROM b WHERE false";
        const run = controller(doc, query);
        try {
            expect(await run.value.submit()).toMatchObject({ status: "refused", mode: "selection-required" });
            expect(a.handles.data.size + b.handles.data.size).toBe(0);
            run.grid.entry.set("insertTargetTableId", b.id);
            expect(await run.value.submit()).toEqual({
                status: "inserted",
                targetId: b.id,
                targetSqlName: "b",
                rowId: expect.any(String),
                visibility: "pending",
            });
            expect([...b.handles.data.values()][0]!.get("value")).toBe(7);
            run.grid.entry.set("insertTargetTableId", "missing");
            expect(await run.value.submit()).toMatchObject({ status: "refused" });
            expect(b.handles.data.size).toBe(1);
        } finally {
            run.value.dispose();
        }
    });

    it("does not replay an insertion after persisted Project and Table state reload", async () => {
        const doc = new Y.Doc({ guid: "grid-insert-remount" });
        const a = table(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, title TEXT NOT NULL)");
        const run = controller(doc, "SELECT * FROM a LIMIT 0");
        expect((await run.value.submit()).status).toBe("inserted");
        run.value.dispose();
        const projectUpdate = Y.encodeStateAsUpdate(doc);
        const tableUpdate = Y.encodeStateAsUpdate(a.handles.doc);
        const restoredDoc = new Y.Doc({ guid: doc.guid });
        Y.applyUpdate(restoredDoc, projectUpdate);
        const restoredTable = getTableHandles(restoredDoc, a.id)!;
        Y.applyUpdate(restoredTable.doc, tableUpdate);
        const restoredGrid = getGridHandles(restoredDoc, run.grid.gridId)!;
        const restoredHistory = restoredTable.undo.undoStack.length;
        const restored = createGridInsertController({
            projectDoc: restoredDoc,
            gridEntry: restoredGrid.entry,
            query: "SELECT * FROM a LIMIT 0",
            connect,
        });
        try {
            expect(restoredTable.data.size).toBe(1);
            expect(restoredTable.undo.undoStack.length).toBe(restoredHistory);
        } finally {
            restored.dispose();
        }
    });
});
