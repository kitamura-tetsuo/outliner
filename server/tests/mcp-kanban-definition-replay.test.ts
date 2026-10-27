import { expect } from "chai";
import {
    getKanbanDefinitionTarget,
    getKanbanRegistry,
    readKanbanSettings,
} from "../../shared/src/services/kanbanDefinition.js";
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

    it("returns the retained update receipt without overwriting an intervening peer edit", async () => {
        const fixture = await startMcpTestServer();
        try {
            const created = await fixture.mcp.call("create_kanban", {
                projectId: PROJECT,
                settings: { name: "initial" },
                operationId: "update-replay-create",
            });
            const kanbanId = created.payload.kanbanId as string;
            const observed = (await fixture.mcp.call("get_kanban", { projectId: PROJECT, kanbanId })).payload;
            const args = {
                projectId: PROJECT,
                kanbanId,
                observationToken: observed.observationToken,
                changes: { name: "first update" },
                operationId: "retained-update",
            };
            const original = await fixture.mcp.call("update_kanban", args);
            expect(original.payload).to.include({ saved: true, applied: true, replayed: false });

            let registryWrites = 0;
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const registry = getKanbanRegistry(doc as never);
                getKanbanDefinitionTarget(doc as never, kanbanId)!.entry.set("name", "peer edit");
                registry.observeDeep(() => registryWrites++);
            });

            const replay = await fixture.mcp.call("update_kanban", args);
            expect(replay.payload).to.deep.equal({ ...original.payload, replayed: true });
            expect(registryWrites).to.equal(0);
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                expect(readKanbanSettings(getKanbanRegistry(doc as never).get(kanbanId)!).name).to.equal("peer edit");
            });
        } finally {
            await fixture.stop();
        }
    });
});
