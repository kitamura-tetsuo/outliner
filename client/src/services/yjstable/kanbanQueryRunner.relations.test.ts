import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createKanban, getKanbanHandles } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, deleteRecord, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

async function waitForProjection(
    projections: KanbanProjection[],
    predicate: (value: KanbanProjection) => boolean,
): Promise<KanbanProjection> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        const value = projections.at(-1);
        if (value && predicate(value)) return value;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Timed out waiting for Kanban projection");
}

afterEach(async () => resetTableEngineForTests());
afterAll(async () => resetPgliteForTests());

describe("Kanban additional-relation invalidation", { timeout: 30000 }, () => {
    it("automatically recomputes when a joined Table changes", async () => {
        const projectId = `kanban-relations-${crypto.randomUUID()}`;
        const projectDoc = new Y.Doc({ guid: projectId });
        const tasksId = createTable(projectDoc, "Tasks", "tasks");
        const tasks = getTableHandles(projectDoc, tasksId)!;
        setSchemaText(tasks, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)");
        addRecord(tasks, { title: "First", status: "todo" }, "t1");
        const filterId = createTable(projectDoc, "Filter", "task_filter");
        const filter = getTableHandles(projectDoc, filterId)!;
        setSchemaText(filter, "CREATE TABLE task_filter (id TEXT PRIMARY KEY, task_id TEXT)");
        addRecord(filter, { task_id: "t1" }, "f1");

        const kanbanId = createKanban(projectDoc, tasksId, {
            query: "SELECT tasks.id, tasks.title, tasks.status FROM tasks "
                + "JOIN task_filter ON task_filter.task_id = tasks.id ORDER BY tasks.id",
            groupField: "status",
        });
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const acquired = await session.acquire(tasksId);
        const runner = new KanbanQueryRunner({
            projectDoc,
            kanbanId,
            kanban: getKanbanHandles(projectDoc, kanbanId)!,
            sourceAdapter: acquired!.adapter,
        });
        const projections: KanbanProjection[] = [];
        runner.subscribeProjection(value => projections.push(value));
        runner.start();
        await runner.runQueryNow();
        const initial = await waitForProjection(projections, value => value.status === "success" && value.current);
        expect(initial.lanes[0].cards).toHaveLength(1);

        deleteRecord(filter, "f1");
        const invalidated = await waitForProjection(projections, value => !value.current);
        expect(invalidated.status).toBe("success");
        const refreshed = await waitForProjection(
            projections,
            value => value.status === "success" && value.current && value.result?.rows.length === 0,
        );
        expect(refreshed.lanes).toEqual([]);

        runner.dispose();
        session.dispose();
    });
});
