import { expect } from "chai";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban destination identity scope through registered MCP", function() {
    this.timeout(120_000);
    it("ignores IDs outside the selected Page but refuses ambiguity inside the requested scope", async () => {
        const f = await startMcpTestServer();
        try {
            const ids = await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                createKanbanEntry(doc, "board", {
                    name: "Board",
                    query: "SELECT 1",
                    groupField: "g",
                    titleField: "t",
                    detailFields: [],
                });
                const project = Project.fromDoc(doc);
                const page = project.items.at(0)!;
                const layout = page.items.addNode("owner");
                layout.componentType = "layout";
                const other = project.addPage("Other", "owner");
                const outside = other.items.addNode("owner");
                outside.componentType = "layout";
                outside.id = layout.id;
                const nested = other.items.addNode("owner");
                nested.id = page.id;
                return {
                    page: page.id,
                    layout: layout.id,
                    outsideKey: outside.key,
                    selectedKey: layout.key,
                    other: other.id,
                };
            });
            const observed = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" });
            const common = {
                projectId: PROJECT,
                kanbanId: "board",
                observationToken: observed.payload.observationToken,
            };
            const placed = await f.mcp.call("place_kanban", {
                ...common,
                destination: { pageId: ids.page, layoutId: ids.layout },
                operationId: "scope-valid",
            });
            expect(placed.payload).to.include({ applied: true, pageId: ids.page, parentId: ids.layout });
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                const page = [...project.items].find(item => item.id === ids.page)!;
                const selected = [...page.items].find(item => item.key === ids.selectedKey)!;
                const other = [...project.items].find(item => item.id === ids.other)!;
                const outside = [...other.items].find(item => item.key === ids.outsideKey)!;
                expect([...selected.items].map(item => item.key)).to.deep.equal([placed.payload.placementId]);
                expect(outside.items.length).to.equal(0);
                const duplicate = page.items.addNode("peer");
                duplicate.componentType = "layout";
                duplicate.id = ids.layout;
            });
            const ambiguousLayout = await f.mcp.call("place_kanban", {
                ...common,
                destination: { pageId: ids.page, layoutId: ids.layout },
                operationId: "scope-ambiguous-layout",
            });
            expect(ambiguousLayout.payload.code).to.equal("validation_failed");
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                const duplicate = project.addPage("Duplicate", "peer");
                duplicate.id = ids.page;
            });
            const ambiguousPage = await f.mcp.call("place_kanban", {
                ...common,
                destination: { pageId: ids.page },
                operationId: "scope-ambiguous-page",
            });
            expect(ambiguousPage.payload.code).to.equal("validation_failed");
            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                const project = Project.fromDoc(doc);
                const selected = [...project.items].flatMap(page => [...page.items]).find(item =>
                    item.key === ids.selectedKey
                )!;
                expect([...selected.items].map(item => item.key)).to.deep.equal([placed.payload.placementId]);
                expect([...project.items].flatMap(page => [...page.items]).filter(item => item.kanbanId === "board")).to
                    .have.length(0);
            });
        } finally {
            await f.stop();
        }
    });
});
