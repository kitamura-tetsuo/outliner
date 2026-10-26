import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban metadata ranges through production MCP HTTP", function() {
    this.timeout(120_000);

    it("orders registry cursors consistently across mixed-case identities", async () => {
        const fixture = await startMcpTestServer();
        try {
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                for (const kanbanId of ["a", "B", "A", "b"]) {
                    createKanbanEntry(doc, kanbanId, { name: "Identical name" });
                }
            });
            const ids: string[] = [];
            let cursor: string | undefined;
            do {
                const response = await fixture.mcp.call("list_kanbans", { projectId: PROJECT, limit: 1, cursor });
                expect(response.result.isError, JSON.stringify(response)).not.to.equal(true);
                expect(response.payload.totalCount).to.equal(4);
                expect(response.payload.returnedCount).to.equal(1);
                ids.push(response.payload.kanbans[0].kanbanId);
                cursor = response.payload.nextCursor;
            } while (cursor);
            expect(ids).to.deep.equal(["A", "B", "a", "b"]);
        } finally {
            await fixture.stop();
        }
    });

    it("returns real mixed semantic kinds and independently guarded later placement ranges", async () => {
        const fixture = await startMcpTestServer();
        try {
            let pageId = "";
            const placements: Array<{ itemId: string; placementId: string; }> = [];
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                const page = project.addPage("Mixed nodes", UID);
                pageId = page.id;
                page.items.addNode(UID).updateText("Ordinary text");
                const layout = page.items.addNode(UID);
                layout.componentType = "layout";
                const grid = layout.items.addNode(UID);
                grid.componentType = "yjstable";
                grid.yjsGridId = "grid-1";
                const calendar = layout.items.addNode(UID);
                calendar.componentType = "calendar";
                calendar.calendarId = "calendar-1";
                const diagram = layout.items.addNode(UID);
                diagram.componentType = "diagram";
                diagram.diagramId = "diagram-1";
                createKanbanEntry(doc, "board", { name: "Board" });
                for (let i = 0; i < 3; i++) {
                    const placement = layout.items.addNode(UID);
                    placement.componentType = "kanban";
                    placement.kanbanId = "board";
                    placements.push({ itemId: placement.id, placementId: placement.key });
                }
            });
            const subtree = await fixture.mcp.call("get_subtree", {
                projectId: PROJECT,
                itemId: pageId,
                depth: 3,
                limit: 20,
            });
            expect(subtree.result.isError, JSON.stringify(subtree)).not.to.equal(true);
            expect(subtree.payload.root.children.map((item: { kind: string; }) => item.kind))
                .to.deep.equal(["text", "layout"]);
            const nested = subtree.payload.root.children[1].children;
            expect(nested.map((item: { kind: string; }) => item.kind))
                .to.deep.equal(["grid", "calendar", "diagram", "kanban", "kanban", "kanban"]);
            expect(
                nested.slice(3).map((item: { kanbanId: string; placementId: string; }) => ({
                    kanbanId: item.kanbanId,
                    placementId: item.placementId,
                })),
            ).to.deep.equal(placements.map(item => ({ kanbanId: "board", placementId: item.placementId })));

            // Let the completed subtree read fully unload its direct room so
            // each following token starts from a stable room incarnation.
            await waitForRoomRelease(fixture.server.hocuspocus.documents, `projects/${PROJECT}`);

            const sorted = [...placements].sort((a, b) => a.placementId.localeCompare(b.placementId));
            for (const offset of [0, 1, 2, 3]) {
                const read = await fixture.mcp.call("get_kanban", {
                    projectId: PROJECT,
                    kanbanId: "board",
                    placementOffset: offset,
                    placementLimit: 1,
                });
                expect(read.result.isError, JSON.stringify(read)).not.to.equal(true);
                expect(read.payload).to.include({ placementCount: 3, returnedCount: offset < 3 ? 1 : 0, offset });
                expect(read.payload.truncated).to.equal(offset < 2);
                if (offset < 3) {
                    expect(read.payload.placements[0]).to.include({ ...sorted[offset], pageId });
                    const guard = fixture.server.kanbanObservations.acquire(
                        UID,
                        PROJECT,
                        read.payload.observationToken,
                    );
                    guard.assertCurrent({
                        kind: "placement",
                        kanbanId: "board",
                        placementId: sorted[offset]!.placementId,
                    });
                    guard.release();
                }
                await fixture.server.kanbanObservations.release(read.payload.observationToken);
                await waitForRoomRelease(fixture.server.hocuspocus.documents, `projects/${PROJECT}`);
            }

            const latest = await fixture.mcp.call("get_kanban", {
                projectId: PROJECT,
                kanbanId: "board",
                placementOffset: 1,
                placementLimit: 1,
            });
            const guard = fixture.server.kanbanObservations.acquire(UID, PROJECT, latest.payload.observationToken);
            const target = sorted[1]!.placementId;
            guard.assertCurrent({ kind: "placement", kanbanId: "board", placementId: target });
            const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}`) as Y.Doc;
            Project.fromDoc(doc).tree.deleteNodeAndDescendants(target);
            expect(() => guard.assertCurrent({ kind: "placement", kanbanId: "board", placementId: target }))
                .to.throw("observation_changed");
            guard.release();
            await fixture.server.kanbanObservations.release(latest.payload.observationToken);
        } finally {
            await fixture.stop();
        }
    });
});

async function waitForRoomRelease(documents: Map<string, unknown>, room: string): Promise<void> {
    let absentChecks = 0;
    for (let attempt = 0; attempt < 100 && absentChecks < 2; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        absentChecks = documents.has(room) ? 0 : absentChecks + 1;
    }
    expect(absentChecks, `${room} did not remain unloaded`).to.equal(2);
}
