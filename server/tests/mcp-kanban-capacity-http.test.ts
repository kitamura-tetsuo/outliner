import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban observation capacity through production MCP HTTP", function() {
    this.timeout(120_000);

    it("preserves metadata and query reads when the observation authority is full", async () => {
        const fixture = await startMcpTestServer();
        const retained: string[] = [];
        try {
            await seedBoard(fixture.server.hocuspocus);
            for (let index = 0; index < 64; index++) {
                const read = await fixture.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
                expect(read.result.isError, JSON.stringify(read)).not.to.equal(true);
                expect(read.payload.mutationObservation).to.deep.equal({ available: true });
                retained.push(read.payload.observationToken);
            }

            const metadata = await fixture.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(metadata.result.isError, JSON.stringify(metadata)).not.to.equal(true);
            expect(metadata.payload.settings).to.include({ name: "Board", titleField: "title" });
            expect(metadata.payload.placements).to.deep.equal([]);
            expect(metadata.payload.mutationObservation).to.deep.equal({ available: false, reason: "capacity" });
            expect(metadata.payload).not.to.have.property("observationToken");
            expect(metadata.payload).not.to.have.property("expiresAt");

            const query = await fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(query.result.isError, JSON.stringify(query)).not.to.equal(true);
            expect(query.payload.projection.status).to.equal("success");
            expect(query.payload.counts).to.include({ totalCards: 1, returnedCards: 1 });
            const card = query.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards)[0];
            expect(card.row).to.include({ title: "First", status: "todo" });
            expect(card.fieldCapabilities.find((field: { outputField: string; }) => field.outputField === "title"))
                .to.deep.equal({ outputField: "title", updateEligible: false, reason: "capacity" });
            expect(card.moveCapability).to.deep.equal({ eligible: false, reason: "capacity" });
            expect(query.payload.mutationObservation).to.deep.equal({ available: false, reason: "capacity" });
            expect(query.payload).not.to.have.property("observationToken");
            expect(query.payload).not.to.have.property("expiresAt");

            // Refused captures release only their untransferred leases: an
            // earlier retained observation remains independently consumable.
            const guard = fixture.server.kanbanObservations.acquire(UID, PROJECT, retained[0]!);
            guard.assertCurrent({
                kind: "definition",
                kanbanId: "board",
                keys: ["name", "query", "groupField", "titleField", "detailFields", "laneOrder"],
            });
            guard.release();
        } finally {
            await Promise.all(retained.map(token => fixture.server.kanbanObservations.release(token)));
            await fixture.stop();
        }
    });
});

async function seedBoard(host: Parameters<typeof withRoom>[0]): Promise<void> {
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
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        row.set("title", "First");
        doc.getMap("data").set("r1", row);
    });
}
