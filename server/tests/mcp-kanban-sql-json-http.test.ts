import { expect } from "chai";
import sinon from "sinon";
import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
} from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";
describe("Kanban SQL value serialization through MCP", function() {
    this.timeout(120_000);
    it("reads a non-null outline timestamp through authenticated MCP", async () => {
        const f = await startMcpTestServer();
        try {
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = Project.fromDoc(doc).addPage("Dates", UID);
                const item = page.items.addNode(UID);
                item.updateText("Card");
                item.yMap.set("start", "2026-11-01T10:00:00Z");
                item.yMap.set("allDay", false);
                createKanbanEntry(doc, "board", {
                    name: "Dates",
                    query: "SELECT id, text, start_at FROM outline_items WHERE start_at IS NOT NULL",
                    groupField: "text",
                    titleField: "text",
                    detailFields: ["start_at"],
                });
            });
            const result = await f.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(result.result.isError, JSON.stringify(result.payload)).not.to.equal(true);
            expect(result.payload.projection.status).to.equal("success");
            expect(result.payload.mutationObservation.available).to.equal(true);
            expect(result.payload.observationToken).to.be.a("string");
            const card = result.payload.lanes.flatMap((lane: any) => lane.cards)[0];
            expect(card.sourceRef).to.include({ kind: "system", id: "outline_items" });
            expect(card.row.start_at).to.equal("2026-11-01T10:00:00.000Z");
            const guard = f.server.kanbanObservations.acquire(UID, PROJECT, result.payload.observationToken);
            guard.assertCurrent({
                kind: "outline-field",
                kanbanId: "board",
                scopeId: JSON.stringify(["outline_items", card.sourceRef.rowId, "start_at"]),
            });
            guard.release();
            const sql = await f.mcp.call("query_sql", {
                projectId: PROJECT,
                sql: "SELECT start_at AS ts FROM outline_items WHERE start_at IS NOT NULL",
            });
            expect(sql.result.isError, JSON.stringify(sql.payload)).not.to.equal(true);
            expect(sql.payload.rows[0].ts).to.equal(card.row.start_at);
            const sqlText =
                "SELECT id, text, start_at, ARRAY['2026-11-02'::date, '2026-11-03'::date] AS dates, jsonb_build_object('nested', jsonb_build_array(1, true, null, 'value')) AS payload, repeat('界', 10000) AS long_text, 9223372036854775807::bigint AS big, 12345678901234567890.123456789::numeric AS precise FROM outline_items WHERE start_at IS NOT NULL";
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, { query: sqlText });
            });
            const rich = await f.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(rich.result.isError, JSON.stringify(rich.payload)).not.to.equal(true);
            expect(rich.payload.projection.status, JSON.stringify(rich.payload)).to.equal("success");
            const row = rich.payload.lanes.flatMap((lane: any) => lane.cards)[0].row;
            expect(row.payload).to.deep.equal({ nested: [1, true, null, "value"] });
            expect(row.long_text).to.equal("界".repeat(10000));
            expect(row.dates).to.deep.equal(["2026-11-02T00:00:00.000Z", "2026-11-03T00:00:00.000Z"]);
            expect(String(row.big)).to.equal("9223372036854775807");
            expect(String(row.precise)).to.equal("12345678901234567890.123456789");
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, {
                    query:
                        "SELECT id, text, start_at, repeat('😀', 300000) AS payload FROM outline_items WHERE start_at IS NOT NULL",
                });
            });
            const release = sinon.spy(f.server.kanbanObservations, "release");
            const overflow = await f.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(overflow.payload.projection).to.include({ status: "unavailable", reason: "resource_limit" });
            expect(overflow.payload).not.to.have.property("lanes");
            expect(overflow.payload).not.to.have.property("observationToken");
            expect(release.calledOnce).to.equal(true);
            const releasedToken = release.firstCall.args[0];
            expect(() => f.server.kanbanObservations.acquire(UID, PROJECT, releasedToken)).to.throw();
            release.restore();
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = [...Project.fromDoc(doc).items].find(item => item.text === "Dates")!;
                const item = [...page.items][0]!;
                expect(item.yMap.get("start")).to.equal("2026-11-01T10:00:00Z");
                expect(item.yMap.get("allDay")).to.equal(false);
            });
        } finally {
            await f.stop();
        }
    });
});
