import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { KanbanCardOperationController } from "./kanbanCardOperations";
import { createKanban, getKanban, getKanbanHandles, updateKanban } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import type { RelationResolver } from "./relationRowWrite";
import { addRecord, createTable, getTableHandles, setRecordValue, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const SCHEMA =
    "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT CHECK (status IN ('', 'todo', 'done')) )";
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose() {},
});
const delay = () => new Promise(resolve => setTimeout(resolve, 250));

async function fixture(query = "SELECT id, title, status FROM tasks ORDER BY title") {
    const projectDoc = new Y.Doc({ guid: `kanban-write-${crypto.randomUUID()}` });
    const tableId = createTable(projectDoc, "Tasks", "tasks");
    const table = getTableHandles(projectDoc, tableId)!;
    setSchemaText(table, SCHEMA);
    addRecord(table, { title: "Beta", status: "todo" }, "one");
    addRecord(table, { title: "Alpha", status: "" }, "two");
    addRecord(table, { title: "Null lane", status: null }, "three");
    const otherId = createTable(projectDoc, "Other", "other_tasks");
    const other = getTableHandles(projectDoc, otherId)!;
    setSchemaText(other, SCHEMA.replace("tasks", "other_tasks"));
    addRecord(other, { title: "Union", status: "todo" }, "one");
    const kanbanId = createKanban(projectDoc, tableId, { query, groupField: "status", titleField: "title" });
    const session = createTableEngineSession({ projectDoc, projectId: projectDoc.guid, connect: localConnector });
    const acquired = await session.acquire(tableId);
    const runner = new KanbanQueryRunner({
        projectDoc,
        kanbanId,
        kanban: getKanbanHandles(projectDoc, kanbanId)!,
        sourceAdapter: acquired!.adapter,
    });
    let projection: KanbanProjection = { status: "loading", current: false, lanes: [], columns: [] };
    runner.subscribeProjection(value => projection = value);
    runner.start();
    await delay();
    await runner.runQueryNow();
    const refresh = async () => {
        await delay();
        await runner.runQueryNow();
        return projection;
    };
    const controller = (resolver: RelationResolver = session) =>
        new KanbanCardOperationController({
            resolver,
            schema: () => runner.sourceSchema,
            settings: () => getKanban(projectDoc, kanbanId),
            projection: () => projection,
            canWrite: () => true,
        });
    return {
        projectDoc,
        table,
        other,
        kanbanId,
        session,
        runner,
        controller,
        refresh,
        get projection() {
            return projection;
        },
    };
}

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("Kanban card operations from saved SELECT execution", { timeout: 30000 }, () => {
    it("routes source-identified UNION occurrences to their actual provider", async () => {
        const c = await fixture(
            "SELECT 'tasks' AS source_kind, id AS source_id, title, status FROM tasks UNION ALL SELECT 'other_tasks', id, title, status FROM other_tasks ORDER BY title",
        );
        const card = c.projection.lanes.flatMap(l => l.cards).find(v => v.sourceIdentity?.kind === "other_tasks")!;
        expect(c.controller().begin(card, "title")).toBe(true);
        await expect(c.controller().commit("wrong controller")).resolves.toMatchObject({ ok: false });
        const operation = c.controller();
        expect(operation.begin(card, "title")).toBe(true);
        await expect(operation.commit("Edited union")).resolves.toMatchObject({ ok: true });
        expect(c.other.data.get("one")?.get("title")).toBe("Edited union");
        expect(c.table.data.get("one")?.get("title")).toBe("Beta");
        c.runner.dispose();
        c.session.dispose();
    });

    it("refuses every readonly saved-SELECT family and wrong-table bare ids", async () => {
        const c = await fixture();
        for (
            const query of [
                "SELECT tasks.id, tasks.title, tasks.status FROM tasks JOIN other_tasks ON true",
                "SELECT id, max(title) AS title, status FROM tasks GROUP BY id, status",
                "SELECT DISTINCT id, title, status FROM tasks",
                "SELECT id, upper(title) AS title, status FROM tasks",
                "SELECT id, title, status FROM other_tasks",
            ]
        ) {
            updateKanban(c.projectDoc, c.kanbanId, { query });
            await c.refresh();
            const card = c.projection.lanes.flatMap(l => l.cards)[0];
            if (card) {
                const op = c.controller();
                if (op.begin(card, "title")) await expect(op.commit("Denied")).resolves.toMatchObject({ ok: false });
            }
            expect(c.table.data.get("one")?.get("title")).toBe("Beta");
        }
        c.runner.dispose();
        c.session.dispose();
    });

    it("writes NULL and empty lane keys exactly and Undo/Redo changes only that field", async () => {
        const c = await fixture();
        const card = c.projection.lanes.find(l => l.key === "todo")!.cards[0];
        let op = c.controller();
        expect(op.begin(card, "status")).toBe(true);
        expect(op.chooseDestination("")).toBe(true);
        await expect(op.commit("")).resolves.toMatchObject({ ok: true });
        expect(c.table.data.get("one")?.toJSON()).toEqual({ id: "one", title: "Beta", status: "" });
        globalUndoRouter.undo();
        expect(c.table.data.get("one")?.get("status")).toBe("todo");
        globalUndoRouter.redo();
        expect(c.table.data.get("one")?.get("status")).toBe("");
        setRecordValue(c.table, "one", "status", "todo");
        await c.refresh();
        op = c.controller();
        expect(op.begin(c.projection.lanes.find(l => l.key === "todo")!.cards[0], "status", null)).toBe(true);
        await expect(op.commit(null)).resolves.toMatchObject({ ok: true });
        expect(c.table.data.get("one")?.get("status")).toBeNull();
        c.runner.dispose();
        c.session.dispose();
    });

    it("observes a held real-provider boundary and blocks stale intent", async () => {
        const c = await fixture();
        let release!: () => void;
        let observed!: () => void;
        const held = new Promise<void>(resolve => release = resolve);
        const reached = new Promise<void>(resolve => observed = resolve);
        const resolver: RelationResolver = {
            resolveRelation: async name => {
                const provider = await c.session.resolveRelation(name);
                observed();
                await held;
                return provider;
            },
        };
        const op = c.controller(resolver);
        const card = c.projection.lanes.find(l => l.key === "todo")!.cards[0];
        expect(op.begin(card, "title")).toBe(true);
        const pending = op.commit("Stale");
        await reached;
        setRecordValue(c.table, "one", "title", "Peer");
        await c.refresh();
        release();
        await expect(pending).resolves.toMatchObject({ ok: false });
        expect(c.table.data.get("one")?.get("title")).toBe("Peer");
        c.runner.dispose();
        c.session.dispose();
    });
});
