import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createKanban, getKanban, getKanbanHandles, updateKanban } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, removeTable, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

async function waitFor(published: KanbanProjection[], predicate: (value: KanbanProjection) => boolean) {
    await expect.poll(() => {
        const latest = published.at(-1);
        return latest !== undefined && predicate(latest);
    }, { timeout: 5000 }).toBe(true);
    return published.at(-1)!;
}

async function setup(query: string, groupField = "") {
    const projectId = `kanban-settings-${crypto.randomUUID()}`;
    const projectDoc = new Y.Doc({ guid: projectId });
    const tableId = createTable(projectDoc, "Tasks", "tasks");
    const table = getTableHandles(projectDoc, tableId)!;
    setSchemaText(table, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, detail TEXT)");
    addRecord(table, { title: "Alpha", status: "open", detail: "First" }, "t1");
    addRecord(table, { title: "Beta", status: "done", detail: "Second" }, "t2");
    const kanbanId = createKanban(projectDoc, tableId, { query, groupField });
    const handles = getKanbanHandles(projectDoc, kanbanId)!;
    const engine = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
    const runner = new KanbanQueryRunner({ projectDoc, projectId, kanbanId, kanban: handles, connect: localConnector });
    const published: KanbanProjection[] = [];
    runner.subscribeProjection(value => published.push(value));
    runner.start();
    await runner.runQueryNow();
    return { projectDoc, tableId, kanbanId, handles, engine, runner, published };
}

function dispose(context: Awaited<ReturnType<typeof setup>>) {
    context.runner.dispose();
    context.engine.dispose();
}

afterEach(async () => resetTableEngineForTests());
afterAll(async () => resetPgliteForTests());

describe("Kanban setting-only projection", { timeout: 30000 }, () => {
    it("recovers incomplete and invalid roles, including Undo and Redo, without rerunning manually", async () => {
        const context = await setup("SELECT id, title, status, detail FROM tasks ORDER BY id");
        expect(context.published.at(-1)).toMatchObject({ status: "incomplete" });

        updateKanban(context.projectDoc, context.kanbanId, { groupField: "missing" });
        await waitFor(
            context.published,
            value => value.status === "invalid" && value.message?.includes("missing") === true,
        );
        updateKanban(context.projectDoc, context.kanbanId, { groupField: "status", titleField: "title" });
        let success = await waitFor(context.published, value => value.status === "success" && value.current);
        expect(success.lanes.map(lane => lane.key)).toEqual(["open", "done"]);
        expect(success.lanes.flatMap(lane => lane.cards).map(card => card.row.title)).toEqual(["Alpha", "Beta"]);

        globalUndoRouter.undo();
        await waitFor(
            context.published,
            value => value.status === "invalid" && value.message?.includes("missing") === true,
        );
        globalUndoRouter.redo();
        success = await waitFor(context.published, value => value.status === "success" && value.current);
        expect(success.lanes.flatMap(lane => lane.cards).map(card => card.row.title)).toEqual(["Alpha", "Beta"]);
        dispose(context);
    });

    it("preserves padded SQL while applying lane and display-role changes", async () => {
        const query = "\nSELECT id, title, status, detail FROM tasks ORDER BY id\n";
        const context = await setup(query, "status");
        await waitFor(context.published, value => value.status === "success" && value.current);

        updateKanban(context.projectDoc, context.kanbanId, {
            titleField: "title",
            detailFields: ["detail"],
            laneOrder: ["done", "open"],
        });
        const success = await waitFor(
            context.published,
            value => value.status === "success" && value.current && value.lanes[0]?.key === "done",
        );
        expect(success.lanes.map(lane => lane.key)).toEqual(["done", "open"]);
        expect(getKanban(context.projectDoc, context.kanbanId)?.query).toBe(query);
        dispose(context);
    });

    it("does not turn stale evidence into success after its real dependency is removed", async () => {
        const context = await setup("SELECT id, title, status, detail FROM tasks ORDER BY id", "status");
        await waitFor(context.published, value => value.status === "success" && value.current);

        removeTable(context.projectDoc, context.tableId);
        updateKanban(context.projectDoc, context.kanbanId, { titleField: "title" });
        await waitFor(context.published, value => value.status === "unavailable");
        expect(context.published.at(-1)).toMatchObject({ status: "unavailable", current: false });
        dispose(context);
    });
});
