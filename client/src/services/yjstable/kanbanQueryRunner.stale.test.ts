import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createKanban, getKanbanHandles, updateKanban } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
} from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(async () => resetTableEngineForTests());
afterAll(async () => resetPgliteForTests());

describe("Kanban execution currentness", { timeout: 30000 }, () => {
    it("rejects a held A completion after the definition changes A-B-A", async () => {
        const projectId = `kanban-stale-${crypto.randomUUID()}`;
        const projectDoc = new Y.Doc({ guid: projectId });
        const tasksId = createTable(projectDoc, "Tasks", "tasks");
        const tasks = getTableHandles(projectDoc, tasksId)!;
        setSchemaText(tasks, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)");
        addRecord(tasks, { title: "First", status: "todo" }, "t1");

        const filterId = createTable(projectDoc, "Filter", "task_filter");
        const filter = getTableHandles(projectDoc, filterId)!;
        setSchemaText(filter, "CREATE TABLE task_filter (id TEXT PRIMARY KEY, task_id TEXT)");
        addRecord(filter, { task_id: "t1" }, "f1");

        const queryA = "SELECT tasks.id, tasks.title, tasks.status FROM tasks "
            + "JOIN task_filter ON task_filter.task_id = tasks.id ORDER BY tasks.id";
        const queryB = "SELECT id, title, status FROM tasks WHERE false";
        const kanbanId = createKanban(projectDoc, tasksId, { query: queryA, groupField: "status" });
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const acquired = await session.acquire(tasksId);

        let releaseFirst!: () => void;
        const firstResolutionReleased = new Promise<void>(resolve => releaseFirst = resolve);
        let firstResolutionStarted!: () => void;
        const firstResolutionReached = new Promise<void>(resolve => firstResolutionStarted = resolve);
        let resolutionCount = 0;
        const productionResolver = acquired!.adapter.relationRegistry!.resolveRelation!;
        const runner = new KanbanQueryRunner({
            projectDoc,
            kanbanId,
            kanban: getKanbanHandles(projectDoc, kanbanId)!,
            sourceAdapter: acquired!.adapter,
            registry: {
                resolveRelation: async sqlName => {
                    resolutionCount++;
                    if (resolutionCount === 1) {
                        firstResolutionStarted();
                        await firstResolutionReleased;
                    }
                    return await productionResolver(sqlName);
                },
            },
        });

        const published: KanbanProjection[] = [];
        runner.subscribeProjection(projection => published.push(projection));
        runner.start();
        const oldA = runner.runQueryNow();
        await firstResolutionReached;

        updateKanban(projectDoc, kanbanId, { query: queryB });
        updateKanban(projectDoc, kanbanId, { query: queryA });
        const newResult = await runner.runQueryNow();
        expect(newResult?.rows.map(row => row.id)).toEqual(["t1"]);
        // Allow the ordinary debounced definition observer to complete too;
        // this is the newest production execution before the held A returns.
        await new Promise(resolve => setTimeout(resolve, 250));

        const current = published.at(-1)!;
        expect(current).toMatchObject({ status: "success", current: true });
        expect(current.provenance?.execution.query).toBe(queryA);
        const currentQueryId = current.provenance?.execution.queryId;
        const currentOccurrenceKeys = current.lanes.flatMap(lane => lane.cards.map(card => card.occurrenceKey));
        const publicationCountBeforeRelease = published.length;

        releaseFirst();
        await expect(oldA).resolves.toBeUndefined();
        await new Promise(resolve => setTimeout(resolve, 250));

        const afterOldCompletion = published.at(-1)!;
        expect(afterOldCompletion.current).toBe(true);
        expect(afterOldCompletion.provenance?.execution.queryId).toBe(currentQueryId);
        expect(afterOldCompletion.lanes.flatMap(lane => lane.cards.map(card => card.occurrenceKey)))
            .toEqual(currentOccurrenceKeys);
        expect(published).toHaveLength(publicationCountBeforeRelease);

        runner.dispose();
        session.dispose();
        await waitForTableEngineIdle();
    });
});
