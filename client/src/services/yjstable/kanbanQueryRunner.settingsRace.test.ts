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

async function waitForLatest(published: KanbanProjection[], predicate: (value: KanbanProjection) => boolean) {
    await expect.poll(() => {
        const latest = published.at(-1);
        return latest !== undefined && predicate(latest);
    }, { timeout: 5000 }).toBe(true);
    return published.at(-1)!;
}

afterEach(async () => resetTableEngineForTests());
afterAll(async () => resetPgliteForTests());

describe("Kanban setting-only projection races", { timeout: 30000 }, () => {
    it("does not publish a delayed prior setting after a newer setting projection", async () => {
        const projectId = `kanban-setting-race-${crypto.randomUUID()}`;
        const projectDoc = new Y.Doc({ guid: projectId });
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const table = getTableHandles(projectDoc, tableId)!;
        setSchemaText(table, "CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT, detail TEXT)");
        addRecord(table, { status: "open", detail: "First" }, "t1");
        addRecord(table, { status: "done", detail: "Second" }, "t2");
        const kanbanId = createKanban(projectDoc, {
            query: "SELECT tasks.id AS id, tasks.status AS status, tasks.detail AS detail FROM tasks ORDER BY tasks.id",
            groupField: "status",
        });
        const engine = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const productionProvider = await engine.resolveRelation("tasks");
        expect(productionProvider).toBeDefined();
        expect(await productionProvider!.materialize()).toBe(true);

        let holdNext = false;
        let releaseHeld!: () => void;
        const held = new Promise<void>(resolve => releaseHeld = resolve);
        let signalHeld!: () => void;
        const resolutionHeld = new Promise<void>(resolve => signalHeld = resolve);
        const runner = new KanbanQueryRunner({
            projectDoc,
            projectId,
            kanbanId,
            kanban: getKanbanHandles(projectDoc, kanbanId)!,
            connect: localConnector,
            registry: {
                resolveRelation: async sqlName => {
                    if (holdNext) {
                        holdNext = false;
                        signalHeld();
                        await held;
                    }
                    return sqlName === "tasks" ? productionProvider : await engine.resolveRelation(sqlName);
                },
            },
        });
        const published: KanbanProjection[] = [];
        runner.subscribeProjection(value => published.push(value));
        runner.start();
        // Let catalog/materialization invalidations settle before establishing
        // the one evidence object shared by both setting-only projections.
        await new Promise(resolve => setTimeout(resolve, 250));
        await runner.runQueryNow();
        const initial = await waitForLatest(published, value => value.status === "success" && value.current);
        expect(initial.provenance?.analysis?.suppliers.map(source => source.sqlName)).toEqual(["tasks"]);

        holdNext = true;
        updateKanban(projectDoc, kanbanId, { groupField: "detail" });
        await Promise.race([
            resolutionHeld,
            new Promise((_, reject) =>
                setTimeout(() =>
                    reject(
                        new Error(
                            `projection resolver was not reached; latest=${published.at(-1)?.status}`,
                        ),
                    ), 2000)
            ),
        ]);
        updateKanban(projectDoc, kanbanId, { groupField: "status" });
        const current = await waitForLatest(
            published,
            value => value.status === "success" && value.current && value.lanes[0]?.key === "open",
        );
        expect(current.lanes.map(lane => lane.key)).toEqual(["open", "done"]);
        const publicationCount = published.length;

        releaseHeld();
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(published).toHaveLength(publicationCount);
        expect(published.at(-1)?.lanes.map(lane => lane.key)).toEqual(["open", "done"]);

        runner.dispose();
        engine.dispose();
        await waitForTableEngineIdle();
    });
});
