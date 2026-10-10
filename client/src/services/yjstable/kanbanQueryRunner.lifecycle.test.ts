import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createKanban, getKanbanHandles, removeKanban } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

async function setup() {
    const projectId = `kanban-lifecycle-${crypto.randomUUID()}`;
    const projectDoc = new Y.Doc({ guid: projectId });
    const tableId = createTable(projectDoc, "Tasks", "tasks");
    const table = getTableHandles(projectDoc, tableId)!;
    setSchemaText(table, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)");
    addRecord(table, { title: "First", status: "todo" }, "t1");
    const kanbanId = createKanban(projectDoc, tableId, {
        query: "SELECT id, title, status FROM tasks ORDER BY id",
        groupField: "status",
    });
    const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
    const acquired = await session.acquire(tableId);
    const runner = new KanbanQueryRunner({
        projectDoc,
        kanbanId,
        kanban: getKanbanHandles(projectDoc, kanbanId)!,
        sourceAdapter: acquired!.adapter,
    });
    const published: KanbanProjection[] = [];
    runner.subscribeProjection(value => published.push(value));
    runner.start();
    await runner.runQueryNow();
    return { projectDoc, table, kanbanId, session, runner, published };
}

afterEach(async () => resetTableEngineForTests());
afterAll(async () => resetPgliteForTests());

describe("Kanban lifecycle invalidation", { timeout: 30000 }, () => {
    it("publishes unavailable immediately when the definition is removed", async () => {
        const context = await setup();
        expect(context.published.at(-1)).toMatchObject({ status: "success", current: true });

        removeKanban(context.projectDoc, context.kanbanId);
        expect(context.published.at(-1)).toMatchObject({ status: "unavailable", current: false });

        const replayed: KanbanProjection[] = [];
        context.runner.subscribeProjection(value => replayed.push(value));
        expect(replayed).toHaveLength(1);
        expect(replayed[0]).toMatchObject({ status: "unavailable", current: false });
        expect(replayed[0].provenance).toBeUndefined();
        context.runner.dispose();
        context.session.dispose();
    });

    it("invalidates current evidence synchronously when the primary schema changes", async () => {
        const context = await setup();
        expect(context.published.at(-1)).toMatchObject({ status: "success", current: true });

        setSchemaText(context.table, "");
        expect(context.published.at(-1)).toMatchObject({ status: "success", current: false });

        const replayed: KanbanProjection[] = [];
        context.runner.subscribeProjection(value => replayed.push(value));
        expect(replayed[0]).toMatchObject({ status: "success", current: false });
        context.runner.dispose();
        context.session.dispose();
    });
});
