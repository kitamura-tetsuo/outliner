import { createSqlCatalogObject } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "./gridDocs";
import { createGridInsertController } from "./gridInsertController";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName } from "./sqlNames";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} });

function fixture(doc: Y.Doc, schema: string, projectId?: string) {
    const tableId = createTable(doc, "Target", "target");
    const table = getTableHandles(doc, tableId)!;
    setSchemaText(table, schema);
    const gridId = createGrid(doc, undefined, { query: "SELECT * FROM target WHERE false" });
    const grid = getGridHandles(doc, gridId)!;
    return {
        grid,
        table,
        controller: createGridInsertController({
            projectDoc: doc,
            projectId,
            gridEntry: grid.entry,
            query: grid.entry.get("query") as string,
            connect,
        }),
    };
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid INSERT physical-value validation", { timeout: 60_000 }, () => {
    it.each([
        "status TEXT DEFAULT 'Open' CHECK (status IN ('Open','Done')), CHECK (status <> 'Open')",
        "status TEXT DEFAULT 'Open' CHECK (status IN ('Open','Done') AND status <> 'Open')",
        "status TEXT DEFAULT 'Open' CHECK (status IN ('Open','Done')), CHECK (false)",
        "status TEXT DEFAULT 'Open' CHECK (status IN ('Open','Done')), CHECK (status IN ('Done','Closed'))",
    ])("rejects an unproved combined CHECK before physical effects: %s", async columns => {
        const doc = new Y.Doc({ guid: `grid-check-${columns}` });
        const run = fixture(doc, `CREATE TABLE target (id TEXT PRIMARY KEY, ${columns})`, doc.guid);
        const engine = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect });
        const acquired = await engine.acquire(run.table.tableId);
        const recordErrors: unknown[][] = [];
        const unsubscribe = acquired!.adapter.subscribe({ onRecordErrors: errors => recordErrors.push(errors) });
        const beforeHistory = run.table.undo.undoStack.length;
        try {
            expect(await run.controller.submit()).toMatchObject({ status: "refused", mode: "invalid-record" });
            expect(run.table.data.toJSON()).toEqual({});
            expect(run.table.undo.undoStack.length).toBe(beforeHistory);
            expect(recordErrors.every(errors => errors.length === 0)).toBe(true);
            const result = await runSelect(`SELECT * FROM "${projectSchemaName(doc.guid)}".target`);
            expect(result.rows).toEqual([]);
        } finally {
            unsubscribe();
            run.controller.dispose();
            engine.dispose();
        }
    });

    it.each(["TEXT", "VARCHAR(36)", "UUID"])("uses physical defaults with a supported %s identity", async idType => {
        const doc = new Y.Doc({ guid: `grid-insert-physical-defaults-${idType}` });
        createSqlCatalogObject(
            doc as unknown as Parameters<typeof createSqlCatalogObject>[0],
            "enum",
            "CREATE TYPE workflow_state AS ENUM ('Open', 'Done')",
        );
        const run = fixture(
            doc,
            `CREATE TABLE target (id ${idType} PRIMARY KEY, status TEXT DEFAULT 'Done' NOT NULL CHECK (status IN ('Open', 'Done')), state workflow_state DEFAULT 'Done' NOT NULL)`,
            doc.guid,
        );
        run.controller.dispose();
        const warm = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect });
        await warm.acquire(run.table.tableId);
        const controller = createGridInsertController({
            projectDoc: doc,
            projectId: doc.guid,
            gridEntry: run.grid.entry,
            query: run.grid.entry.get("query") as string,
            connect,
        });
        try {
            const outcome = await controller.submit();
            expect(outcome).toEqual({
                status: "inserted",
                targetId: run.table.tableId,
                targetSqlName: "target",
                rowId: expect.any(String),
                visibility: "outside",
            });
            expect(run.table.data.size).toBe(1);
            expect([...run.table.data.values()][0]!.toJSON()).toMatchObject({ status: "Done", state: "Done" });
        } finally {
            controller.dispose();
            warm.dispose();
        }
    });

    it.each([
        ["numeric generated identity", "CREATE TABLE target (id INTEGER PRIMARY KEY, title TEXT)"],
        ["short generated identity", "CREATE TABLE target (id VARCHAR(12) PRIMARY KEY, title TEXT)"],
        ["overlong default", "CREATE TABLE target (id TEXT PRIMARY KEY, title VARCHAR(3) DEFAULT 'long')"],
        [
            "NULL default on required field",
            "CREATE TABLE target (id TEXT PRIMARY KEY, title VARCHAR(12) NOT NULL DEFAULT NULL)",
        ],
        ["invalid numeric default", "CREATE TABLE target (id TEXT PRIMARY KEY, amount INTEGER NOT NULL DEFAULT NULL)"],
        ["required UUID", "CREATE TABLE target (id TEXT PRIMARY KEY, token UUID NOT NULL)"],
        [
            "checked required text",
            "CREATE TABLE target (id TEXT PRIMARY KEY, token TEXT NOT NULL CHECK (length(token) > 0))",
        ],
    ])("refuses an unsupported %s before Yjs mutation", async (_label, schema) => {
        const doc = new Y.Doc({ guid: `grid-insert-invalid-${_label}` });
        const run = fixture(doc, schema);
        const history = run.table.undo.undoStack.length;
        try {
            expect(await run.controller.submit()).toMatchObject({ status: "refused", mode: "invalid-record" });
            expect(run.table.data.size).toBe(0);
            expect(run.table.undo.undoStack.length).toBe(history);
        } finally {
            run.controller.dispose();
        }
    });
});
