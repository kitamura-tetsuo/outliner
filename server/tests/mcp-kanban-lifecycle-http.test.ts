import { expect } from "chai";
import crypto from "node:crypto";
import { createKanbanEntry, getKanbanRegistry } from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { auditRecords, PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban lifecycle through the registered production MCP boundary", function() {
    this.timeout(120_000);

    it("places on a Page and Layout, removes a placement, and deletes the board references", async () => {
        const f = await startMcpTestServer();
        try {
            const seeded = await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                const page = project.items.at(0)!;
                const layout = page.items.addNode("owner");
                layout.componentType = "layout";
                createKanbanEntry(doc, "board", {
                    name: "Board",
                    query: "SELECT 1",
                    groupField: "group",
                    titleField: "title",
                    detailFields: [],
                });
                return { pageId: page.id, layoutId: layout.id, originalChildren: page.items.length };
            });
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(observed.result.isError, JSON.stringify(observed.payload)).not.to.equal(true);
            const common = {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
            };
            const preview = await f.mcp.call("place_kanban", {
                ...common,
                destination: { pageId: seeded.pageId, layoutId: seeded.layoutId },
                operationId: "preview-layout",
                dryRun: true,
            });
            expect(preview.payload).to.include({ applied: false, replayed: false, wouldChange: true });
            expect(preview.payload).not.to.have.property("placementId");
            const invalidSpan = await f.mcp.call("place_kanban", {
                ...common,
                destination: { pageId: seeded.pageId },
                columnSpan: 5,
                operationId: "invalid-root-span",
            });
            expect(invalidSpan.payload).to.include({ code: "invalid_argument" });
            const root = await f.mcp.call("place_kanban", {
                ...common,
                destination: { pageId: seeded.pageId },
                operationId: "place-root",
            });
            expect(root.payload).to.include({ applied: true, pageId: seeded.pageId, parentId: seeded.pageId });
            const rootReplay = await f.mcp.call("place_kanban", {
                ...common,
                destination: { pageId: seeded.pageId },
                operationId: "place-root",
            });
            expect(rootReplay.payload).to.include({
                applied: true,
                replayed: true,
                placementId: root.payload.placementId,
            });
            const layout = await f.mcp.call("place_kanban", {
                ...common,
                destination: { pageId: seeded.pageId, layoutId: seeded.layoutId },
                columnSpan: 5,
                operationId: "place-layout",
            });
            expect(layout.payload).to.include({ applied: true, pageId: seeded.pageId, parentId: seeded.layoutId });

            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                const page = project.findPage(seeded.pageId)!;
                const layoutNode = [...page.items].find(item => item.id === seeded.layoutId)!;
                expect(page.items.length).to.equal(seeded.originalChildren + 1);
                expect(layoutNode.items.length).to.equal(1);
                expect(layoutNode.items.at(0)!.columnSpan).to.equal(5);
                expect(layoutNode.items.at(0)!.kanbanId).to.equal("board");
                expect(getKanbanRegistry(doc).size).to.equal(1);
            });

            const refreshed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            const remove = await f.mcp.call("remove_kanban_placement", {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: refreshed.payload.observationToken,
                placementId: layout.payload.placementId,
                operationId: "remove-layout",
            });
            expect(remove.payload).to.include({ applied: true, placementId: layout.payload.placementId });

            const deletionObservation = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            const deleted = await f.mcp.call("delete_kanban", {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: deletionObservation.payload.observationToken,
                operationId: "delete-board",
            });
            expect(deleted.payload).to.include({ applied: true, removedPlacementCount: 1 });
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                expect(getKanbanRegistry(doc).has("board")).to.equal(false);
                expect(findByKey(Project.fromDoc(doc), root.payload.placementId)).to.equal(undefined);
                expect(doc.getMap("yjsTables").has("table-existing")).to.equal(true);
            });
        } finally {
            await f.stop();
        }
    });

    it("retains and audits an unknown persisted outcome without repeating the effect", async () => {
        const f = await startMcpTestServer();
        try {
            const pageId = await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                createKanbanEntry(doc, "board", {
                    name: "Board",
                    query: "SELECT 1",
                    groupField: "group",
                    titleField: "title",
                    detailFields: [],
                });
                return Project.fromDoc(doc).items.at(0)!.id;
            });
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            f.seams.afterStore = room => {
                if (room === `projects/${PROJECT}`) throw new Error("confirmation lost");
            };
            const operationId = `unknown-place-${crypto.randomUUID()}`;
            const args = {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
                destination: { pageId },
                operationId,
            };
            const first = await f.mcp.call("place_kanban", args, { requestId: "unknown-first" });
            const replay = await f.mcp.call("place_kanban", args, { requestId: "unknown-replay" });
            expect(first.payload).to.include({ code: "internal_failure", applied: null, replayed: false });
            expect(replay.payload).to.include({ code: "internal_failure", applied: null, replayed: true });
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const page = Project.fromDoc(doc).findPage(pageId)!;
                expect([...page.items].filter(item => item.kanbanId === "board")).to.have.length(1);
            });
            const records = await auditRecords([operationId]);
            expect(
                records.map(record => ({ entity: record.entity, applied: record.applied, replayed: record.replayed })),
            )
                .to.deep.equal([
                    { entity: "kanban:board", applied: null, replayed: false },
                    { entity: "kanban:board", applied: null, replayed: true },
                ]);
        } finally {
            await f.stop();
        }
    });
});

function findByKey(project: Project, key: string) {
    const visit = (items: Iterable<import("../src/schema/app-schema.js").Item>): boolean => {
        for (const item of items) if (item.key === key || visit(item.items)) return true;
        return false;
    };
    return visit(project.items) ? key : undefined;
}
