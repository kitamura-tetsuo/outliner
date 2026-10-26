import { expect } from "chai";
import * as Y from "yjs";
import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
} from "../../shared/src/services/kanbanDefinition.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban query ranges and diagnostics through production MCP HTTP", function() {
    this.timeout(120_000);

    it("keeps complete counts across later card ranges and guards each read independently", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seedTaskBoard(fixture.server.hocuspocus);
            const call = (offset: number) =>
                fixture.mcp.call("query_kanban", {
                    projectId: PROJECT,
                    kanbanId: "board",
                    cardOffset: offset,
                    maxCards: 1,
                });
            const first = await call(0);
            const second = await call(1);
            const pastEnd = await call(10);
            for (const [response, offset] of [[first, 0], [second, 1], [pastEnd, 10]] as const) {
                expect(response.result.isError, JSON.stringify(response)).not.to.equal(true);
                expect(response.payload.projection.status).to.equal("success");
                expect(response.payload.counts).to.deep.equal({
                    totalCards: 3,
                    returnedCards: offset === 10 ? 0 : 1,
                    offset,
                    cardsTruncated: true,
                });
                expect(
                    response.payload.lanes.reduce(
                        (sum: number, lane: { totalCards: number; }) => sum + lane.totalCards,
                        0,
                    ),
                ).to.equal(3);
                expect(response.payload.mutationObservation).to.deep.equal({ available: true });
            }
            expect(first.payload.projection.queryId).not.to.equal(second.payload.projection.queryId);
            const firstCard = first.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards)[0];
            const secondCard = second.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards)[0];
            expect(firstCard.occurrenceId).not.to.equal(secondCard.occurrenceId);
            const guard = fixture.server.kanbanObservations.acquire(UID, PROJECT, second.payload.observationToken);
            guard.assertCurrent({
                kind: "table-field",
                kanbanId: "board",
                scopeId: `tasks:${secondCard.sourceRef.rowId}:title`,
                sourceRef: secondCard.sourceRef,
                outputField: "title",
                physicalColumn: "title",
                role: "title",
            });
            guard.release();
            for (const response of [first, second, pastEnd]) {
                await fixture.server.kanbanObservations.release(response.payload.observationToken);
            }
        } finally {
            await fixture.stop();
        }
    });

    it("keeps invalid, incomplete, missing-source, and output-budget refusals distinct", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seedTaskBoard(fixture.server.hocuspocus);
            const query = () => fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
            const update = async (sql: string) =>
                withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                    applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, { query: sql });
                });
            for (
                const [sql, status, reason] of [
                    ["SELECT FROM", "invalid", "invalid_query"],
                    ["", "incomplete", "missing_role"],
                    ["SELECT id, status, title FROM nonexistent_relation", "unavailable", "missing_source"],
                ]
            ) {
                await update(sql);
                const read = await query();
                expect(read.result.isError, JSON.stringify(read)).not.to.equal(true);
                expect(read.payload.projection).to.include({ status, reason });
                expect(read.payload).not.to.have.property("observationToken");
                expect(read.payload.mutationObservation.available).to.equal(false);
            }
            await update("SELECT id, status, title FROM tasks ORDER BY id");
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}/tables/tasks`, doc => {
                doc.getMap<Y.Map<unknown>>("data").get("r1")!.set("title", "x".repeat(1_100_000));
            });
            const overBudget = await fixture.mcp.call("query_kanban", {
                projectId: PROJECT,
                kanbanId: "board",
                maxCards: 1,
            });
            expect(overBudget.result.isError, JSON.stringify(overBudget)).not.to.equal(true);
            expect(overBudget.payload.projection).to.include({
                status: "unavailable",
                current: true,
                reason: "resource_limit",
                responseBudget: 1024 * 1024,
            });
            expect(overBudget.payload).not.to.have.property("lanes");
            expect(overBudget.payload).not.to.have.property("observationToken");
        } finally {
            await fixture.stop();
        }
    });
});

async function seedTaskBoard(host: Parameters<typeof withRoom>[0]): Promise<void> {
    await withRoom(host, `projects/${PROJECT}`, doc => {
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        doc.getMap("yjsTables").set("tasks", table);
        createKanbanEntry(doc, "board", {
            name: "Board",
            query: "SELECT id, status, title FROM tasks ORDER BY id",
            groupField: "status",
            titleField: "title",
        });
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        doc.getText("schema").insert(0, "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT)");
        for (const [id, status] of [["r1", "todo"], ["r2", "done"], ["r3", "todo"]]) {
            const row = new Y.Map<unknown>();
            row.set("status", status);
            row.set("title", `Task ${id}`);
            doc.getMap("data").set(id, row);
        }
    });
}
