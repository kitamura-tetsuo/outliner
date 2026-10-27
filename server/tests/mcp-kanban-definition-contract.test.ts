import { expect } from "chai";
import { getKanbanRegistry, readKanbanSettings } from "../../shared/src/services/kanbanDefinition.js";
import { createDocumentLoader } from "../src/persistence.js";
import { PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban mutation validation, defaults, previews and no-ops", function() {
    this.timeout(120_000);

    it("stores incomplete defaults and SQL-invalid text without evaluating it", async () => {
        const fixture = await startMcpTestServer();
        try {
            const first = await fixture.mcp.call("create_kanban", {
                projectId: PROJECT,
                operationId: "contract-default",
            });
            expect(first.payload.settings).to.deep.equal({
                name: "Kanban",
                query: "",
                detailFields: [],
                laneOrder: [],
            });
            const invalidSql = await fixture.mcp.call("create_kanban", {
                projectId: PROJECT,
                settings: { name: "Kanban", query: "DELETE FROM anything RETURNING *" },
                operationId: "contract-invalid-sql",
            });
            expect(invalidSql.payload).to.include({ saved: true, applied: true });
            expect(invalidSql.payload.projection).to.deep.equal({ evaluated: false });
            expect(invalidSql.payload.kanbanId).not.to.equal(first.payload.kanbanId);
            const reloaded = await createDocumentLoader(fixture.server.persistence!)(`projects/${PROJECT}`);
            expect(reloaded).not.to.equal(undefined);
            expect(readKanbanSettings(getKanbanRegistry(reloaded as never).get(invalidSql.payload.kanbanId)!)).to
                .include({ name: "Kanban", query: "DELETE FROM anything RETURNING *" });
        } finally {
            await fixture.stop();
        }
    });

    it("keeps update previews and canonical no-ops effect-free", async () => {
        const fixture = await startMcpTestServer();
        try {
            const created = await fixture.mcp.call("create_kanban", {
                projectId: PROJECT,
                settings: { name: "same", query: "SELECT 1" },
                operationId: "contract-noop-create",
            });
            const kanbanId = created.payload.kanbanId;
            const observed = (await fixture.mcp.call("get_kanban", { projectId: PROJECT, kanbanId })).payload;
            let updates = 0;
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                doc.on("update", () => updates++);
            });
            const preview = await fixture.mcp.call("update_kanban", {
                projectId: PROJECT,
                kanbanId,
                observationToken: observed.observationToken,
                changes: { name: "candidate" },
                operationId: "contract-preview",
                dryRun: true,
            });
            expect(preview.payload).to.include({ saved: false, applied: false, wouldChange: true });
            expect(preview.payload.candidateChanges).to.deep.equal({ name: "candidate" });
            const noop = await fixture.mcp.call("update_kanban", {
                projectId: PROJECT,
                kanbanId,
                observationToken: observed.observationToken,
                changes: { name: "same" },
                operationId: "contract-noop",
            });
            expect(noop.payload).to.include({ saved: true, applied: false, replayed: false });
            expect(updates).to.equal(0);
        } finally {
            await fixture.stop();
        }
    });

    it("rejects duplicate arrays, unknown fields and oversized supplied payloads atomically", async () => {
        const fixture = await startMcpTestServer();
        try {
            for (
                const [operationId, settings] of [
                    ["contract-duplicate", { detailFields: ["x", "x"] }],
                    ["contract-unknown", { sourceTableId: "private" }],
                    ["contract-oversized", { query: "界".repeat(11_000) }],
                ] as const
            ) {
                const result = await fixture.mcp.call("create_kanban", { projectId: PROJECT, operationId, settings });
                expect(result.result.isError).to.equal(true);
                expect(result.payload.code).to.equal(
                    operationId === "contract-oversized" ? "size_limit" : "invalid_argument",
                );
            }
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                expect(getKanbanRegistry(doc as never).size).to.equal(0);
            });
        } finally {
            await fixture.stop();
        }
    });
});
