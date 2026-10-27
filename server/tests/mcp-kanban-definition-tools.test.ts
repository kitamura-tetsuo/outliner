import { expect } from "chai";
import { getKanbanRegistry, readKanbanSettings } from "../../shared/src/services/kanbanDefinition.js";
import { PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban definition mutations through production MCP", function() {
    this.timeout(120_000);

    it("creates, previews, and exactly patches a persisted independent definition", async () => {
        const fixture = await startMcpTestServer();
        try {
            const initialTableCount = await withRoom(
                fixture.server.hocuspocus,
                `projects/${PROJECT}`,
                doc => doc.getMap("yjsTables").size,
            );
            const tools = await fixture.production.rpc("tools/list", {});
            for (const name of ["create_kanban", "update_kanban"]) {
                const tool = tools.tools.find((candidate: { name: string; }) => candidate.name === name);
                expect(tool).not.to.equal(undefined);
                expect(tool.annotations.readOnlyHint).to.equal(false);
                expect(tool._meta.securitySchemes[0].scopes).to.deep.equal(["outliner.read", "outliner.write"]);
                expect(tool.inputSchema.additionalProperties).to.equal(false);
            }

            const preview = await fixture.production.call("create_kanban", {
                projectId: PROJECT,
                settings: { name: " Board ", query: "  SELECT * FROM missing  " },
                operationId: "preview-create",
                dryRun: true,
            });
            expect(preview.result.isError).not.to.equal(true);
            expect(preview.payload).to.include({ saved: false, applied: false, replayed: false, wouldChange: true });
            expect(preview.payload).not.to.have.property("kanbanId");

            const created = await fixture.production.call("create_kanban", {
                projectId: PROJECT,
                settings: {
                    name: " Board ",
                    query: "  SELECT * FROM missing  ",
                    laneOrder: [null, "", "NULL", " "],
                },
                operationId: "create-one",
            });
            expect(created.result.isError, JSON.stringify(created.payload)).not.to.equal(true);
            expect(created.payload).to.include({ saved: true, applied: true, replayed: false });
            expect(created.payload.projection).to.deep.equal({ evaluated: false });

            const observed = await fixture.production.call("get_kanban", {
                projectId: PROJECT,
                kanbanId: created.payload.kanbanId,
            });
            const updated = await fixture.production.call("update_kanban", {
                projectId: PROJECT,
                kanbanId: created.payload.kanbanId,
                observationToken: observed.payload.observationToken,
                changes: { name: "Exact", groupField: "", detailFields: [] },
                operationId: "update-one",
            });
            expect(updated.result.isError, JSON.stringify(updated.payload)).not.to.equal(true);
            expect(updated.payload).to.include({ saved: true, applied: true, replayed: false });
            expect(updated.payload.acceptedChanges).to.deep.equal({ name: "Exact", groupField: "", detailFields: [] });

            const replay = await fixture.production.call("update_kanban", {
                projectId: PROJECT,
                kanbanId: created.payload.kanbanId,
                observationToken: observed.payload.observationToken,
                changes: { name: "Exact", groupField: "", detailFields: [] },
                operationId: "update-one",
            });
            expect(replay.payload).to.include({ saved: true, applied: true, replayed: true });

            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                expect(getKanbanRegistry(doc as never).size).to.equal(1);
                const settings = readKanbanSettings(getKanbanRegistry(doc as never).get(created.payload.kanbanId)!);
                expect(settings).to.deep.equal({
                    name: "Exact",
                    query: "  SELECT * FROM missing  ",
                    detailFields: [],
                    laneOrder: [null, "", "NULL", " "],
                });
                expect(doc.getMap("yjsTables").size).to.equal(initialTableCount);
            });
        } finally {
            await fixture.stop();
        }
    });
});
