import { expect } from "chai";
import {
    createKanbanEntry,
    getKanbanDefinitionTarget,
    getKanbanRegistry,
    readKanbanSettings,
} from "../../shared/src/services/kanbanDefinition.js";
import { PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban selected-setting observation guards", function() {
    this.timeout(120_000);

    it("rejects same-key ABA and definition recreation but preserves unrelated peer changes", async () => {
        const fixture = await startMcpTestServer();
        try {
            const created = await fixture.mcp.call("create_kanban", {
                projectId: PROJECT,
                settings: { name: "A", query: "SELECT 1" },
                operationId: "currentness-create",
            });
            const kanbanId = created.payload.kanbanId as string;
            const observe = async () =>
                (await fixture.mcp.call("get_kanban", { projectId: PROJECT, kanbanId })).payload;
            const updateName = (observationToken: string, operationId: string) =>
                fixture.mcp.call("update_kanban", {
                    projectId: PROJECT,
                    kanbanId,
                    observationToken,
                    changes: { name: "remote" },
                    operationId,
                });

            const aba = await observe();
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const entry = getKanbanDefinitionTarget(doc as never, kanbanId)!.entry;
                entry.set("name", "B");
                entry.set("name", "A");
            });
            const stale = await updateName(aba.observationToken, "currentness-aba");
            expect(stale.result.isError).to.equal(true);
            expect(stale.payload).to.include({ code: "stale_revision", reason: "observation_changed" });

            const unrelated = await observe();
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                getKanbanDefinitionTarget(doc as never, kanbanId)!.entry.set("query", "  broken SQL  ");
            });
            const accepted = await updateName(unrelated.observationToken, "currentness-unrelated");
            expect(accepted.payload).to.include({ saved: true, applied: true });
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                expect(readKanbanSettings(getKanbanRegistry(doc as never).get(kanbanId)!)).to.include({
                    name: "remote",
                    query: "  broken SQL  ",
                });
            });

            const recreated = await observe();
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                getKanbanRegistry(doc as never).delete(kanbanId);
                createKanbanEntry(doc as never, kanbanId, { name: "replacement" });
            });
            const replaced = await updateName(recreated.observationToken, "currentness-recreated");
            expect(replaced.result.isError).to.equal(true);
            expect(replaced.payload).to.include({ code: "stale_revision", reason: "observation_changed" });
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const entry = getKanbanRegistry(doc as never).get(kanbanId);
                expect(entry).not.to.equal(undefined);
                expect(readKanbanSettings(entry!).name).to.equal("replacement");
            });
        } finally {
            await fixture.stop();
        }
    });
});
