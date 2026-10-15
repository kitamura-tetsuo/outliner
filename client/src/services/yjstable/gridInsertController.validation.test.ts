import { createSqlCatalogObject } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles } from "./gridDocs";
import { createGridInsertController } from "./gridInsertController";
import { resetPgliteForTests } from "./pgliteService";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} });

function fixture(doc: Y.Doc, schema: string, projectId?: string) {
    const tableId = createTable(doc, "Target", "target");
    const table = getTableHandles(doc, tableId)!;
    setSchemaText(table, schema);
    const gridId = createGrid(doc, tableId, { query: "SELECT * FROM target WHERE false" });
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
    it("uses CHECK and catalog ENUM defaults before their first labels", async () => {
        const doc = new Y.Doc({ guid: "grid-insert-physical-defaults" });
        createSqlCatalogObject(
            doc as unknown as Parameters<typeof createSqlCatalogObject>[0],
            "enum",
            "CREATE TYPE workflow_state AS ENUM ('Open', 'Done')",
        );
        const run = fixture(
            doc,
            "CREATE TABLE target (id TEXT PRIMARY KEY, status TEXT DEFAULT 'Done' NOT NULL CHECK (status IN ('Open', 'Done')), state workflow_state DEFAULT 'Done' NOT NULL)",
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
            expect(outcome).toEqual({ status: "inserted", targetId: run.table.tableId, targetSqlName: "target" });
            expect(run.table.data.size).toBe(1);
            expect([...run.table.data.values()][0]!.toJSON()).toMatchObject({ status: "Done", state: "Done" });
        } finally {
            controller.dispose();
            warm.dispose();
        }
    });

    it.each([
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
