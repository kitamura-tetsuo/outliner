import { expect } from "chai";
import { getKanbanRegistry } from "../../shared/src/services/kanbanDefinition.js";
import { auditRecords, PROJECT, startMcpTestServer, token, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

function expectBareForbidden(response: { result: { isError?: boolean; }; payload: Record<string, unknown>; }) {
    expect(response.result.isError).to.equal(true);
    expect(response.payload.code).to.equal("forbidden");
    for (const field of ["kanbanId", "applied", "replayed", "reason", "settings"]) {
        expect(response.payload).not.to.have.property(field);
    }
}

describe("Kanban mutation authorization and audit boundaries", function() {
    this.timeout(120_000);

    for (const outcome of ["saved", "unknown"] as const) {
        it(`withholds a post-store ${outcome} creation while preserving its audit effect and replay`, async () => {
            const fixture = await startMcpTestServer();
            const operationId = `kanban-revoked-${outcome}`;
            try {
                fixture.seams.afterStore = room => {
                    if (room !== `projects/${PROJECT}`) return;
                    fixture.acl.revokeAll(PROJECT);
                    if (outcome === "unknown") throw new Error("acknowledgement delivery lost");
                };
                const denied = await fixture.mcp.call("create_kanban", {
                    projectId: PROJECT,
                    settings: { name: outcome },
                    operationId,
                });
                expectBareForbidden(denied);

                const ids = await withRoom(
                    fixture.server.hocuspocus,
                    `projects/${PROJECT}`,
                    doc => [...getKanbanRegistry(doc as never).keys()],
                );
                expect(ids).to.have.length(1);

                const [record] = await auditRecords([operationId]);
                expect(record).to.include({
                    tool: "create_kanban",
                    projectId: PROJECT,
                    entity: `kanban:${ids[0]}`,
                    applied: outcome === "saved" ? true : null,
                    replayed: false,
                    outcome: "forbidden",
                });

                fixture.seams.afterStore = undefined;
                fixture.acl.grant("projectUsers", PROJECT, UID);
                const replay = await fixture.mcp.call("create_kanban", {
                    projectId: PROJECT,
                    settings: { name: outcome },
                    operationId,
                });
                if (outcome === "saved") {
                    expect(replay.payload).to.include({ saved: true, applied: true, replayed: true });
                    expect(replay.payload.kanbanId).to.equal(ids[0]);
                } else {
                    expect(replay.result.isError).to.equal(true);
                    expect(replay.payload).to.include({ code: "internal_failure", applied: null, replayed: true });
                }
                const finalCount = await withRoom(
                    fixture.server.hocuspocus,
                    `projects/${PROJECT}`,
                    doc => getKanbanRegistry(doc as never).size,
                );
                expect(finalCount).to.equal(1);
            } finally {
                await fixture.stop();
            }
        });
    }

    it("rejects read-only scope before malformed private arguments", async () => {
        const fixture = await startMcpTestServer();
        try {
            const denied = await fixture.mcp.call("update_kanban", {
                projectId: PROJECT,
                kanbanId: "private-board",
                changes: { secret: true },
            }, { bearer: token(UID, "outliner.read") });
            expectBareForbidden(denied);
            expect(denied.result._meta["mcp/www_authenticate"]).to.contain("outliner.write");
        } finally {
            await fixture.stop();
        }
    });
});
