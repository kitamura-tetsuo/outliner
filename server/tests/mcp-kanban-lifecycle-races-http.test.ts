import { expect } from "chai";
import { createKanbanEntry, getKanbanRegistry } from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { auditRecords, deferred, PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban lifecycle contested HTTP requests", function() {
    this.timeout(120_000);

    it("refuses a destination replaced after capture without creating a placement", async () => {
        const f = await startMcpTestServer();
        const release = deferred();
        try {
            const destination = await setup(f);
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            const captured = deferred();
            f.seams.gate = async (id, check) => {
                if (id === "replace-destination" && check === 3) {
                    captured.resolve();
                    await release.promise;
                }
            };
            const pending = f.mcp.call("place_kanban", {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
                destination: { pageId: destination.pageId, layoutId: destination.layoutId },
                operationId: "replace-destination",
            }, { requestId: "replace-destination" });
            await captured.promise;
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = Project.fromDoc(doc).findPage(destination.pageId)!;
                const layout = [...page.items].find(item => item.id === destination.layoutId)!;
                layout.delete();
                const replacement = page.items.addNode("peer");
                replacement.componentType = "layout";
            });
            release.resolve();
            const result = await pending;
            expect(result.payload.code).to.equal("stale_revision");
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = Project.fromDoc(doc).findPage(destination.pageId)!;
                expect([...page.items].filter(item => item.kanbanId === "board")).to.have.length(0);
                expect([...page.items].filter(item => item.componentType === "layout")).to.have.length(1);
            });
        } finally {
            release.resolve();
            await f.stop();
        }
    });

    it("joins concurrent identical effects and retains the receipt after disclosure revocation", async () => {
        const f = await startMcpTestServer();
        const release = deferred();
        try {
            const destination = await setup(f);
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            const stored = deferred();
            f.seams.afterStore = async room => {
                if (room === `projects/${PROJECT}`) {
                    stored.resolve();
                    await release.promise;
                }
            };
            const args = {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
                destination: { pageId: destination.pageId },
                operationId: "concurrent-place",
            };
            const first = f.mcp.call("place_kanban", args, { requestId: "first" });
            await stored.promise;
            const secondAdmitted = deferred();
            f.seams.gate = (id, check) => {
                if (id === "second" && check === 1) secondAdmitted.resolve();
            };
            const second = f.mcp.call("place_kanban", args, { requestId: "second" });
            await secondAdmitted.promise;
            const changed = await f.mcp.call("place_kanban", {
                ...args,
                destination: { ...args.destination, layoutId: destination.layoutId },
            });
            expect(changed.payload.code).to.equal("invalid_argument");
            f.acl.revokeAll(PROJECT);
            release.resolve();
            const results = await Promise.all([first, second]);
            expect(results.map(result => result.payload.code)).to.deep.equal(["forbidden", "forbidden"]);
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = Project.fromDoc(doc).findPage(destination.pageId)!;
                expect([...page.items].filter(item => item.kanbanId === "board")).to.have.length(1);
            });
            f.acl.grant("projectUsers", PROJECT, "mcp-table-user");
            const replay = await f.mcp.call("place_kanban", args);
            expect(replay.payload).to.include({ applied: true, replayed: true });
            const records = await auditRecords(["concurrent-place"]);
            expect(records.filter(record => record.outcome === "forbidden").map(record => record.applied)).to.deep
                .equal([
                    true,
                    true,
                ]);
        } finally {
            release.resolve();
            await f.stop();
        }
    });

    it("refuses deletion of a malformed non-leaf without changing the board or children", async () => {
        const f = await startMcpTestServer();
        try {
            const destination = await setup(f);
            const ids = await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = Project.fromDoc(doc).findPage(destination.pageId)!;
                const placement = page.items.addNode("peer");
                placement.componentType = "kanban";
                placement.kanbanId = "board";
                const child = placement.items.addNode("peer");
                return { placement: placement.key, child: child.key };
            });
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            const result = await f.mcp.call("delete_kanban", {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
                operationId: "non-leaf",
            });
            expect(result.payload.code).to.equal("validation_failed");
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = Project.fromDoc(doc).findPage(destination.pageId)!;
                const placement = [...page.items].find(item => item.key === ids.placement)!;
                expect(placement.items.at(0)!.key).to.equal(ids.child);
                expect(getKanbanRegistry(doc).has("board")).to.equal(true);
            });
        } finally {
            await f.stop();
        }
    });
});

async function setup(f: Awaited<ReturnType<typeof startMcpTestServer>>) {
    return withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
        createKanbanEntry(doc, "board", {
            name: "Board",
            query: "SELECT 1",
            groupField: "g",
            titleField: "t",
            detailFields: [],
        });
        const page = Project.fromDoc(doc).items.at(0)!;
        const layout = page.items.addNode("owner");
        layout.componentType = "layout";
        return { pageId: page.id, layoutId: layout.id };
    });
}
