import { expect } from "chai";
import { getKanbanRegistry } from "../../shared/src/services/kanbanDefinition.js";
import { deferred, PROJECT, settleMicrotasks, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { waitFor, withRoom } from "./server-create-table-fixture.js";

describe("Kanban mutation in-flight replay", function() {
    this.timeout(120_000);

    it("joins identical calls and rejects changed input without publishing twice", async () => {
        const fixture = await startMcpTestServer();
        const held = deferred();
        let stores = 0;
        try {
            fixture.seams.afterStore = async room => {
                if (room !== `projects/${PROJECT}`) return;
                stores++;
                await held.promise;
            };
            const args = {
                projectId: PROJECT,
                settings: { name: "joined" },
                operationId: "kanban-in-flight",
            };
            const first = fixture.mcp.call("create_kanban", args);
            await waitFor(() => stores === 1);
            const identical = fixture.mcp.call("create_kanban", args);
            const changed = fixture.mcp.call("create_kanban", {
                ...args,
                settings: { name: "different" },
            });
            await settleMicrotasks();
            expect(stores).to.equal(1);
            const rejected = await changed;
            expect(rejected.result.isError).to.equal(true);
            expect(rejected.payload).to.include({ code: "invalid_argument", reason: "operation_id_reused" });

            held.resolve();
            const [original, replay] = await Promise.all([first, identical]);
            expect(original.payload).to.include({ saved: true, applied: true, replayed: false });
            expect(replay.payload).to.include({ saved: true, applied: true, replayed: true });
            expect(replay.payload.kanbanId).to.equal(original.payload.kanbanId);
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                expect(getKanbanRegistry(doc as never).size).to.equal(1);
            });
        } finally {
            held.resolve();
            await fixture.stop();
        }
    });
});
