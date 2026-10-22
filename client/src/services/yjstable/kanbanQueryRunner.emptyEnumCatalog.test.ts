import { createSqlCatalogObject } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, expect, it } from "vitest";
import * as Y from "yjs";

import { createKanban, getKanban, getKanbanHandles } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

it("preserves an existing Kanban's current results after reloading a Project with an empty ENUM", async () => {
    const projectId = `kanban-empty-enum-${crypto.randomUUID()}`;
    const original = new Y.Doc({ guid: projectId });
    const tableId = createTable(original, "Tasks", "tasks");
    const table = getTableHandles(original, tableId)!;
    setSchemaText(table, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)");
    addRecord(table, { title: "Existing task", status: "todo" }, "task-1");
    const kanbanId = createKanban(original, {
        query: "SELECT id, title, status FROM tasks ORDER BY id",
        groupField: "status",
        titleField: "title",
    });
    createSqlCatalogObject(
        original as unknown as Parameters<typeof createSqlCatalogObject>[0],
        "enum",
        "CREATE TYPE empty_mood AS ENUM ()",
    );

    // Project and Table subdocs persist separately. Restore both from real
    // Yjs updates before starting the ordinary Table engine and Kanban runner.
    const reloaded = new Y.Doc({ guid: projectId });
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(original));
    const restoredTable = getTableHandles(reloaded, tableId)!;
    Y.applyUpdate(restoredTable.doc, Y.encodeStateAsUpdate(table.doc));
    expect(getKanban(reloaded, kanbanId)?.query).toBe("SELECT id, title, status FROM tasks ORDER BY id");
    expect(restoredTable.schemaText.toString())
        .toBe("CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)");
    const engine = createTableEngineSession({ projectDoc: reloaded, projectId, connect: localConnector });
    const runner = new KanbanQueryRunner({
        projectDoc: reloaded,
        projectId,
        kanbanId,
        kanban: getKanbanHandles(reloaded, kanbanId)!,
        connect: localConnector,
    });
    const projections: KanbanProjection[] = [];
    runner.subscribeProjection(projection => projections.push(projection));
    try {
        runner.start();
        await engine.acquire(tableId);
        await runner.runQueryNow();
        const settled = projections.at(-1);
        if (settled?.status === "error") throw new Error(`Kanban SQL failed: ${settled.message}`);
        await expect.poll(() => projections.at(-1)?.status, { timeout: 30_000 }).toBe("success");
        const projection = projections.at(-1)!;
        expect(projection.current).toBe(true);
        expect(projection.lanes).toEqual([expect.objectContaining({
            key: "todo",
            cards: [expect.objectContaining({
                row: expect.objectContaining({ id: "task-1", title: "Existing task", status: "todo" }),
            })],
        })]);
    } finally {
        runner.dispose();
        engine.dispose();
        original.destroy();
        reloaded.destroy();
    }
}, 60_000);
