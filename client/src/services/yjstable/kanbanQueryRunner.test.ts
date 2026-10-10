import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createKanban, getKanbanHandles, updateKanban } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setRecordValue, setSchemaText } from "./tableDocs";
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

async function setup(schema = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, priority INTEGER)") {
    const projectId = `kanban-${crypto.randomUUID()}`;
    const projectDoc = new Y.Doc({ guid: projectId });
    const tableId = createTable(projectDoc, "Tasks", "tasks");
    const table = getTableHandles(projectDoc, tableId)!;
    setSchemaText(table, schema);
    const kanbanId = createKanban(projectDoc, tableId, {
        query: "SELECT id, title, status, priority FROM tasks ORDER BY priority DESC, id",
        groupField: "status",
        titleField: "title",
    });
    const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
    const acquired = await session.acquire(tableId);
    const runner = new KanbanQueryRunner({
        projectDoc,
        kanbanId,
        kanban: getKanbanHandles(projectDoc, kanbanId)!,
        sourceAdapter: acquired!.adapter,
    });
    return { projectDoc, tableId, table, kanbanId, session, runner };
}

async function execute(runner: KanbanQueryRunner): Promise<KanbanProjection> {
    let projection: KanbanProjection | undefined;
    const unsubscribe = runner.subscribeProjection(value => projection = value);
    runner.start();
    // Let production observer debounce/materialization settle before asking
    // for the authoritative execution this assertion observes.
    await new Promise(resolve => setTimeout(resolve, 250));
    await runner.runQueryNow();
    unsubscribe();
    return projection!;
}

afterEach(async () => resetTableEngineForTests());
afterAll(async () => resetPgliteForTests());

describe("Kanban SQL result projection", { timeout: 30000 }, () => {
    it("derives only returned lanes and preserves each SQL-ordered occurrence", async () => {
        const context = await setup();
        addRecord(context.table, { title: "Later", status: "todo", priority: 1 }, "a");
        addRecord(context.table, { title: "First", status: "doing", priority: 5 }, "b");
        addRecord(context.table, { title: "Middle", status: "todo", priority: 3 }, "c");
        addRecord(context.table, { title: "Excluded", status: "done", priority: 9 }, "d");
        updateKanban(context.projectDoc, context.kanbanId, {
            query: "SELECT id, title, status FROM tasks WHERE status <> 'done' ORDER BY priority DESC, id LIMIT 3",
            laneOrder: ["done", "todo"],
        });
        const value = await execute(context.runner);
        expect(value.status).toBe("success");
        expect(value.lanes.map(lane => lane.key)).toEqual(["todo", "doing"]);
        expect(value.lanes.map(lane => lane.cards.map(card => card.sourceIdentity?.id))).toEqual([["c", "a"], ["b"]]);
        expect(new Set(value.lanes.flatMap(lane => lane.cards.map(card => card.occurrenceKey))).size).toBe(3);
        expect(value.provenance).toMatchObject({ sourceTableId: context.tableId, sourceSqlName: "tasks" });
        context.runner.dispose();
        context.session.dispose();
        await waitForTableEngineIdle();
    });

    it("keeps typed edge-case keys distinct and never collapses UNION ALL rows", async () => {
        const context = await setup();
        updateKanban(context.projectDoc, context.kanbanId, {
            query: `SELECT 'same' AS title, status FROM (VALUES
                (NULL::text), (''), (' '), ('NULL'), ('Unassigned'), ('__proto__'), ('constructor'), ('2'), ('10')
                ) AS values(status) UNION ALL SELECT 'same', '2'`,
        });
        const value = await execute(context.runner);
        expect(value.lanes.map(lane => lane.key)).toEqual([
            null,
            "",
            " ",
            "NULL",
            "Unassigned",
            "__proto__",
            "constructor",
            "2",
            "10",
        ]);
        expect(value.lanes.find(lane => lane.key === "2")?.cards).toHaveLength(2);
        expect(value.lanes.flatMap(lane => lane.cards)).toHaveLength(10);
        context.runner.dispose();
        context.session.dispose();
    });

    it("expands only proven primary-table checked TEXT choices", async () => {
        const context = await setup(
            "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT CHECK (status IN ('todo', 'doing', 'done')), priority INTEGER)",
        );
        addRecord(context.table, { title: "One", status: "todo", priority: 1 }, "a");
        let value = await execute(context.runner);
        expect(value.lanes.map(lane => lane.key)).toEqual(["todo", "doing", "done"]);
        updateKanban(context.projectDoc, context.kanbanId, {
            query: "SELECT id, title, upper(status) AS status FROM tasks",
        });
        value = await execute(context.runner);
        expect(value.lanes.map(lane => lane.key)).toEqual(["TODO"]);
        context.runner.dispose();
        context.session.dispose();
    });

    it("reports invalid configurations rather than presenting an empty success", async () => {
        const context = await setup();
        addRecord(context.table, { title: "One", status: "todo", priority: 1 }, "a");
        updateKanban(context.projectDoc, context.kanbanId, { query: "SELECT id, title FROM tasks" });
        let value = await execute(context.runner);
        expect(value).toMatchObject({ status: "invalid", current: false, lanes: [] });
        updateKanban(context.projectDoc, context.kanbanId, { query: "SELECT id, priority AS status FROM tasks" });
        value = await execute(context.runner);
        expect(value.message).toContain("strings or SQL NULL");
        updateKanban(context.projectDoc, context.kanbanId, { groupField: "" });
        value = await execute(context.runner);
        expect(value.status).toBe("incomplete");
        context.runner.dispose();
        context.session.dispose();
    });

    it("reacts to ordinary writes while retaining independent SQL ordering", async () => {
        const context = await setup();
        addRecord(context.table, { title: "One", status: "todo", priority: 1 }, "a");
        addRecord(context.table, { title: "Two", status: "doing", priority: 2 }, "b");
        await execute(context.runner);
        setRecordValue(context.table, "a", "status", "doing");
        setRecordValue(context.table, "a", "priority", 4);
        await new Promise(resolve => setTimeout(resolve, 250));
        const value = await execute(context.runner);
        expect(value.lanes.map(lane => lane.key)).toEqual(["doing"]);
        expect(value.lanes[0].cards.map(card => card.sourceIdentity?.id)).toEqual(["a", "b"]);
        context.runner.dispose();
        context.session.dispose();
    });
});
