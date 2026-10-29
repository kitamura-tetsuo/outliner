import { expect } from "chai";
import { createKanbanEntry, getKanbanRegistry } from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer, token } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban lifecycle currentness through registered MCP", function() {
    this.timeout(120_000);

    it("refuses rebound and recreated placements without deleting the current node", async () => {
        const f = await startMcpTestServer();
        try {
            const placementId = await seed(f, 1);
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const item = find(Project.fromDoc(doc), placementId)!;
                item.kanbanId = "other";
                item.kanbanId = "board";
            });
            const rebound = await f.mcp.call("remove_kanban_placement", {
                projectId: PROJECT,
                kanbanId: "board",
                placementId,
                observationToken: observed.payload.observationToken,
                operationId: "remove-rebound",
            });
            expect(rebound.payload.code).to.equal("stale_revision");
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                expect(find(Project.fromDoc(doc), placementId)?.kanbanId).to.equal("board");
            });

            const fresh = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                find(project, placementId)!.delete();
                const replacement = project.items.at(0)!.items.addNode("peer");
                replacement.componentType = "kanban";
                replacement.kanbanId = "board";
            });
            const recreated = await f.mcp.call("remove_kanban_placement", {
                projectId: PROJECT,
                kanbanId: "board",
                placementId,
                observationToken: fresh.payload.observationToken,
                operationId: "remove-recreated",
            });
            expect(recreated.payload.code).to.equal("stale_revision");
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                expect(placements(Project.fromDoc(doc))).to.have.length(1);
            });
        } finally {
            await f.stop();
        }
    });

    it("deletes the current dynamic set and bounds only the returned sample", async () => {
        const f = await startMcpTestServer();
        try {
            const first = await seed(f, 102);
            const preserved = await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => ({
                tables: [...doc.getMap<import("yjs").Map<unknown>>("yjsTables").entries()].map(([id, table]) => ({
                    id,
                    name: table.get("name"),
                    sqlName: table.get("sqlName"),
                    docGuid: (table.get("doc") as import("yjs").Doc | undefined)?.guid,
                })),
                grids: doc.getMap("yjsGrids").toJSON(),
                pageId: Project.fromDoc(doc).items.at(0)!.id,
                unrelatedItemId: Project.fromDoc(doc).items.at(0)!.items.at(0)!.id,
                pageContent: Project.fromDoc(doc).tree.getNodeValueFromKey(Project.fromDoc(doc).items.at(0)!.key)
                    .toJSON(),
                unrelatedContent: Project.fromDoc(doc).tree.getNodeValueFromKey(
                    Project.fromDoc(doc).items.at(0)!.items.at(0)!.key,
                ).toJSON(),
                calendars: doc.getMap("yjsCalendars").toJSON(),
            }));
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                find(project, first)!.kanbanId = "other";
                const added = project.items.at(0)!.items.addNode("peer");
                added.componentType = "kanban";
                added.kanbanId = "board";
            });
            const deleted = await f.mcp.call("delete_kanban", {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
                operationId: "delete-dynamic",
            });
            expect(deleted.payload).to.include({
                applied: true,
                removedPlacementCount: 102,
                placementIdsTruncated: true,
            });
            expect(deleted.payload.removedPlacementIds).to.have.length(100);
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const remaining = placements(Project.fromDoc(doc));
                expect(remaining).to.have.length(1);
                expect(remaining[0]!.kanbanId).to.equal("other");
                expect(getKanbanRegistry(doc).has("board")).to.equal(false);
                expect(
                    [...doc.getMap<import("yjs").Map<unknown>>("yjsTables").entries()].map(([id, table]) => ({
                        id,
                        name: table.get("name"),
                        sqlName: table.get("sqlName"),
                        docGuid: (table.get("doc") as import("yjs").Doc | undefined)?.guid,
                    })),
                ).to.deep.equal(preserved.tables);
                expect(doc.getMap("yjsGrids").toJSON()).to.deep.equal(preserved.grids);
                const page = Project.fromDoc(doc).items.at(0)!;
                expect(page.id).to.equal(preserved.pageId);
                expect(page.items.at(0)!.id).to.equal(preserved.unrelatedItemId);
                expect(Project.fromDoc(doc).tree.getNodeValueFromKey(page.key).toJSON()).to.deep.equal(
                    preserved.pageContent,
                );
                expect(Project.fromDoc(doc).tree.getNodeValueFromKey(page.items.at(0)!.key).toJSON())
                    .to.deep.equal(preserved.unrelatedContent);
                expect(doc.getMap("yjsCalendars").toJSON()).to.deep.equal(preserved.calendars);
            });
        } finally {
            await f.stop();
        }
    });

    it("enforces write scope and current Project ACL before lifecycle access", async () => {
        const f = await startMcpTestServer();
        try {
            await seed(f, 0);
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            const args = {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
                destination: { pageId: await pageId(f) },
                operationId: "denied-place",
            };
            const scoped = await f.mcp.call("place_kanban", args, { bearer: token(undefined, "outliner.read") });
            expect(scoped.payload.code).to.equal("forbidden");
            f.acl.revokeAll(PROJECT);
            const revoked = await f.mcp.call("place_kanban", args);
            expect(revoked.payload.code).to.equal("forbidden");
        } finally {
            await f.stop();
        }
    });
});

async function seed(f: Awaited<ReturnType<typeof startMcpTestServer>>, count: number) {
    return withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
        createKanbanEntry(doc, "board", {
            name: "Board",
            query: "SELECT 1",
            groupField: "g",
            titleField: "t",
            detailFields: [],
        });
        const page = Project.fromDoc(doc).items.at(0)!;
        let first = "";
        for (let index = 0; index < count; index++) {
            const item = page.items.addNode("owner");
            item.componentType = "kanban";
            item.kanbanId = "board";
            if (!first) first = item.key;
        }
        return first;
    });
}
const placements = (project: Project) =>
    [...project.items].flatMap(page => [...page.items]).filter(item => item.componentType === "kanban");
const find = (project: Project, key: string) => placements(project).find(item => item.key === key);
const pageId = (f: Awaited<ReturnType<typeof startMcpTestServer>>) =>
    withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => Project.fromDoc(doc).items.at(0)!.id);
