import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { KanbanCardOperationController } from "./kanbanCardOperations";
import type { KanbanSettings } from "./kanbanDocs";
import type { KanbanProjection } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { TableRelationProvider } from "./tableRelationProvider";
import { TableSyncAdapter } from "./tableSyncAdapter";

const QUERY = "SELECT id, title, status FROM tasks ORDER BY title";
const SCHEMA =
    "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT CHECK (status IN ('todo', 'done')))";

async function setup() {
    const projectDoc = new Y.Doc();
    const tableId = createTable(projectDoc, "Tasks", "tasks");
    const handles = getTableHandles(projectDoc, tableId)!;
    setSchemaText(handles, SCHEMA);
    const adapter = new TableSyncAdapter(handles, { pgSchema: projectSchemaName(projectDoc.guid) });
    const ready = adapter.start();
    const provider = new TableRelationProvider(handles, adapter, ready);
    await provider.materialize();
    const rowId = addRecord(handles, { title: "One", status: "todo" }, "row-1");
    const settings: KanbanSettings = {
        name: "Tasks",
        query: QUERY,
        groupField: "status",
        titleField: "title",
        detailFields: [],
        laneOrder: [],
    };
    let projection: KanbanProjection = {
        status: "success",
        current: true,
        columns: ["id", "title", "status"],
        result: { columns: ["id", "title", "status"], rows: [{ id: rowId, title: "One", status: "todo" }] },
        lanes: [
            {
                key: "todo",
                cards: [{
                    occurrenceKey: "q:0",
                    sourceIdentity: { id: rowId },
                    row: { id: rowId, title: "One", status: "todo" },
                }],
            },
            { key: "done", cards: [] },
        ],
        provenance: {
            kanbanId: "board",
            sourceSqlName: "tasks",
            query: QUERY,
            schemaSql: SCHEMA,
            execution: {
                queryId: "q",
                generation: 1,
                query: QUERY,
                status: "completed",
                startedAt: "now",
                durationMs: 1,
                rowCount: 1,
                columnCount: 3,
            },
        },
    };
    const controller = new KanbanCardOperationController({
        resolver: { resolveRelation: async name => name === "tasks" ? provider : undefined },
        schema: () => adapter.appliedSchema,
        settings: () => settings,
        projection: () => projection,
        canWrite: () => true,
    });
    return {
        adapter,
        controller,
        handles,
        settings,
        rowId,
        get projection() {
            return projection;
        },
        set projection(value) {
            projection = value;
        },
    };
}

const adapters: TableSyncAdapter[] = [];
afterEach(() => {
    for (const adapter of adapters.splice(0)) adapter.dispose();
});
afterAll(resetPgliteForTests);

describe("KanbanCardOperationController", { timeout: 30000 }, () => {
    it("writes exactly one eligible field through the real Table provider", async () => {
        const context = await setup();
        adapters.push(context.adapter);
        const card = context.projection.lanes[0].cards[0];
        expect(context.controller.begin(card, "title")).toBe(true);
        await expect(context.controller.commit("Edited")).resolves.toMatchObject({ ok: true, state: "success" });
        expect(context.handles.data.get(context.rowId)?.toJSON()).toEqual({
            id: "row-1",
            title: "Edited",
            status: "todo",
        });
    });

    it("refuses stale field values and invalid CHECK destinations without a write", async () => {
        const context = await setup();
        adapters.push(context.adapter);
        const card = context.projection.lanes[0].cards[0];
        expect(context.controller.begin(card, "status")).toBe(true);
        card.row.status = "peer-change";
        await expect(context.controller.commit("done")).resolves.toMatchObject({ ok: false, state: "refused" });
        expect(context.handles.data.get(context.rowId)?.get("status")).toBe("todo");

        card.row.status = "todo";
        expect(context.controller.begin(card, "status")).toBe(true);
        await expect(context.controller.commit("invalid")).resolves.toMatchObject({ ok: false, state: "refused" });
        expect(context.handles.data.get(context.rowId)?.get("status")).toBe("todo");
    });

    it("revalidates after awaited relation resolution and cancels A-to-B-to-A definitions", async () => {
        const context = await setup();
        adapters.push(context.adapter);
        const card = context.projection.lanes[0].cards[0];
        expect(context.controller.begin(card, "title")).toBe(true);
        context.settings.query = "SELECT id FROM tasks";
        context.controller.invalidateDefinition();
        context.settings.query = QUERY;
        await expect(context.controller.commit("stale")).resolves.toMatchObject({ ok: false, state: "refused" });
        expect(context.handles.data.get(context.rowId)?.get("title")).toBe("One");
    });
});
