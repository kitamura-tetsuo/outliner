import { expect } from "chai";
import * as Y from "yjs";
import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
} from "../../shared/src/services/kanbanDefinition.js";
import { PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban card mutation HTTP contract variants", function() {
    this.timeout(600_000);

    it("handles aliased UNION occurrences, exact null/empty/string lanes, constraints, and disappearance", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            let read = await query(fixture);
            const repeated = cards(read).filter((card: any) => card.sourceRef?.rowId === "r1");
            expect(repeated, JSON.stringify(read)).to.have.length(2);
            const edit = await fixture.mcp.call(
                "update_kanban_card",
                update(read, repeated[1], {
                    outputField: "title",
                    value: "Union edit",
                    operationId: "union-alias",
                }),
            );
            expect(edit.payload, JSON.stringify(edit.payload)).to.include({ applied: true });
            expect(await field(fixture, "r1", "title")).to.equal("Union edit");

            await setBoard(fixture, { query: aliasQuery, titleField: "label", detailFields: ["computed"] });
            read = await query(fixture);
            const alias = await fixture.mcp.call(
                "update_kanban_card",
                update(read, card(read, "r1"), {
                    outputField: "label",
                    value: "Alias edit",
                    operationId: "alias-route",
                }),
            );
            expect(alias.payload).to.include({ applied: true });
            expect(await field(fixture, "r1", "title")).to.equal("Alias edit");

            read = await query(fixture);
            const computed = await fixture.mcp.call(
                "update_kanban_card",
                update(read, card(read, "r1"), {
                    outputField: "computed",
                    value: "not writable",
                    operationId: "computed-refusal",
                }),
            );
            expect(computed.result.isError).to.equal(true);
            expect(computed.payload).to.include({ code: "validation_failed" });

            const invalid = await fixture.mcp.call(
                "update_kanban_card",
                update(read, card(read, "r1"), {
                    outputField: "label",
                    value: null,
                    operationId: "constraint-refusal",
                }),
            );
            expect(invalid.result.isError).to.equal(true);
            expect(invalid.payload).to.include({ code: "validation_failed", reason: "source_constraint" });

            const nullMove = await fixture.mcp.call(
                "move_kanban_card",
                move(read, card(read, "r1"), null, "lane-null"),
            );
            expect(nullMove.payload).to.include({ applied: true });
            expect(await field(fixture, "r1", "status")).to.equal(null);

            read = await query(fixture);
            const emptyMove = await fixture.mcp.call(
                "move_kanban_card",
                move(read, card(read, "r2"), "", "lane-empty"),
            );
            expect(emptyMove.payload).to.include({ applied: true });
            expect(await field(fixture, "r2", "status")).to.equal("");

            read = await query(fixture);
            const literalMove = await fixture.mcp.call(
                "move_kanban_card",
                move(read, card(read, "r2"), "NULL", "lane-literal-null"),
            );
            expect(literalMove.payload).to.include({ applied: true });
            expect(await field(fixture, "r2", "status")).to.equal("NULL");

            await setQuery(
                fixture,
                "SELECT 'tasks' AS source_kind, id AS source_id, status, title AS label, "
                    + "title || '!' AS computed FROM tasks WHERE title <> 'Gone'",
            );
            read = await query(fixture);
            const disappear = await fixture.mcp.call(
                "update_kanban_card",
                update(read, card(read, "r1"), {
                    outputField: "label",
                    value: "Gone",
                    operationId: "filtered-disappearance",
                }),
            );
            expect(disappear.payload).to.include({ applied: true });
            expect(cards(await query(fixture)).some((item: any) => item.sourceRef?.rowId === "r1")).to.equal(false);

            await setBoard(fixture, {
                query: "SELECT id, status, title FROM tasks ORDER BY title LIMIT 1",
                titleField: "title",
                detailFields: [],
            });
            read = await query(fixture);
            const first = cards(read)[0];
            const firstId = first.sourceRef.rowId;
            const limited = await fixture.mcp.call(
                "update_kanban_card",
                update(read, first, {
                    outputField: "title",
                    value: "ZZZ last",
                    operationId: "limit-disappearance",
                }),
            );
            expect(limited.payload).to.include({ applied: true });
            expect(await field(fixture, firstId, "title")).to.equal("ZZZ last");
            expect(cards(await query(fixture)).some((item: any) => item.sourceRef?.rowId === firstId)).to.equal(false);
        } finally {
            await fixture.stop();
        }
    });

    it("refuses query/schema ABA and explicitly retired observations", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            let read = await query(fixture);
            const originalQuery = unionQuery;
            await setQuery(fixture, `${originalQuery} ORDER BY title`);
            await setQuery(fixture, originalQuery);
            let refused = await fixture.mcp.call(
                "update_kanban_card",
                update(read, card(read, "r1"), {
                    outputField: "title",
                    value: "Must not land",
                    operationId: "query-aba",
                }),
            );
            expect(refused.payload).to.include({ code: "stale_revision" });

            read = await query(fixture);
            const schema = "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT NOT NULL UNIQUE)";
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}/tables/tasks`, doc => {
                doc.getText("schema").insert(doc.getText("schema").length, " ");
                doc.getText("schema").delete(doc.getText("schema").length - 1, 1);
                expect(doc.getText("schema").toString()).to.equal(schema);
            });
            refused = await fixture.mcp.call(
                "update_kanban_card",
                update(read, card(read, "r1"), {
                    outputField: "title",
                    value: "Must not land",
                    operationId: "schema-aba",
                }),
            );
            expect(refused.payload).to.include({ code: "stale_revision" });

            read = await query(fixture);
            await fixture.server.kanbanObservations.release(read.observationToken);
            refused = await fixture.mcp.call(
                "update_kanban_card",
                update(read, card(read, "r1"), {
                    outputField: "title",
                    value: "Must not land",
                    operationId: "expired-token",
                }),
            );
            expect(refused.payload).to.include({ code: "stale_revision", reason: "observation_unavailable" });
        } finally {
            await fixture.stop();
        }
    });
});

const aliasQuery = "SELECT id, status, title AS label, title || '!' AS computed FROM tasks";
const unionQuery = `SELECT 'tasks' AS source_kind, id AS source_id, title, status FROM tasks WHERE id = 'r1'
    UNION ALL SELECT 'tasks', id, title, status FROM tasks WHERE id = 'r1'
    UNION ALL SELECT 'tasks', id, title, status FROM tasks WHERE id = 'r2'
    UNION ALL SELECT 'tasks', id, title, status FROM tasks WHERE id = 'r3'`;
async function seed(host: Parameters<typeof withRoom>[0]) {
    await withRoom(host, `projects/${PROJECT}`, doc => {
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        doc.getMap("yjsTables").set("tasks", table);
        createKanbanEntry(doc, "board", {
            name: "Board",
            query: unionQuery,
            groupField: "status",
            titleField: "title",
            detailFields: [],
        });
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        doc.getText("schema").insert(
            0,
            "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT NOT NULL UNIQUE)",
        );
        for (
            const [id, status, title] of [
                ["r1", "todo", "First"],
                ["r2", "done", "Second"],
                ["r3", null, "Third"],
                ["r4", "", "Fourth"],
                ["r5", "NULL", "Fifth"],
            ]
        ) {
            const row = new Y.Map<unknown>();
            row.set("status", status);
            row.set("title", title);
            doc.getMap("data").set(id, row);
        }
    });
}
const query = async (fixture: Awaited<ReturnType<typeof startMcpTestServer>>) =>
    (await fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board", maxCards: 100 })).payload;
const cards = (read: any) => read.lanes.flatMap((lane: any) => lane.cards);
const card = (read: any, rowId: string) => cards(read).find((item: any) => item.sourceRef?.rowId === rowId);
const common = (read: any, selected: any) => ({
    projectId: PROJECT,
    kanbanId: "board",
    sourceRef: selected.sourceRef,
    observationToken: read.observationToken,
});
const update = (read: any, selected: any, values: Record<string, unknown>) => ({
    ...common(read, selected),
    ...values,
});
const move = (read: any, selected: any, destination: string | null, operationId: string) => ({
    ...common(read, selected),
    destination,
    operationId,
});
async function field(fixture: Awaited<ReturnType<typeof startMcpTestServer>>, rowId: string, name: string) {
    let result: unknown;
    await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}/tables/tasks`, doc => {
        result = doc.getMap<Y.Map<unknown>>("data").get(rowId)?.get(name);
    });
    return result ?? null;
}
const setQuery = (fixture: Awaited<ReturnType<typeof startMcpTestServer>>, query: string) =>
    withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
        applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, { query });
    });
const setBoard = (
    fixture: Awaited<ReturnType<typeof startMcpTestServer>>,
    updates: Parameters<typeof applyKanbanUpdates>[1],
) => withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
    applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, updates);
});
