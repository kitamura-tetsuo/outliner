import { expect } from "chai";
import { McpReadError, OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { Project } from "../src/schema/app-schema.js";

describe("Outliner MCP read service", () => {
    function fixture(allowed = true) {
        const project = Project.createInstance("MCP test");
        const page = project.addPage("Roadmap", "test");
        const text = page.items.addNode("test");
        text.text = "Ship remote access";
        const layout = page.items.addNode("test");
        layout.componentType = "layout";
        const grid = layout.items.addNode("test");
        grid.componentType = "yjstable";
        grid.yjsGridId = "grid-1";
        const calendar = layout.items.addNode("test");
        calendar.componentType = "calendar";
        calendar.calendarId = "calendar-1";
        let disconnects = 0;
        const service = new OutlinerReadService({
            openDirectConnection: async () => ({
                document: project.ydoc,
                disconnect: async () => {
                    disconnects++;
                },
            }),
        } as never, async () => allowed);
        return { service, page, text, layout, grid, calendar, disconnects: () => disconnects };
    }

    it("retrieves Text and textless visual nodes without flattening kinds", async () => {
        const { service, text, grid, calendar } = fixture();
        expect(await service.getItem("uid", "project-1", text.id)).to.include({
            kind: "text",
            text: "Ship remote access",
        });
        expect(await service.getItem("uid", "project-1", grid.id)).to.deep.include({ kind: "grid", gridId: "grid-1" });
        expect(await service.getItem("uid", "project-1", calendar.id)).to.deep.include({
            kind: "calendar",
            calendarId: "calendar-1",
        });
    });

    it("serializes a mixed subtree in order and respects depth and size bounds", async () => {
        const { service, page } = fixture();
        const full = await service.getSubtree("uid", "project-1", page.id, 3, 20);
        expect(full.root.children?.map(node => node.kind)).to.deep.equal(["text", "layout"]);
        expect(full.root.children?.[1]?.children?.map(node => node.kind)).to.deep.equal(["grid", "calendar"]);
        const bounded = await service.getSubtree("uid", "project-1", page.id, 1, 2);
        expect(bounded.truncated).to.equal(true);
        expect(bounded.root.children).to.have.length(1);
    });

    it("resolves supported URLs and rejects malformed identifiers", () => {
        const { service } = fixture();
        expect(service.resolveUrl("https://outliner.example/project-1/item_2")).to.deep.equal({
            projectId: "project-1",
            itemId: "item_2",
            kind: "item",
        });
        expect(() => service.resolveUrl("javascript:alert(1)")).to.throw(McpReadError, "Unsupported");
        expect(() => service.resolveUrl("https://outliner.example/project/%2Fsecret")).to.throw(McpReadError);
    });

    it("fails closed before opening a document when project access is denied", async () => {
        const { service, text, disconnects } = fixture(false);
        try {
            await service.getItem("uid", "project-1", text.id);
            expect.fail("expected denial");
        } catch (error) {
            expect(error).to.be.instanceOf(McpReadError);
            expect((error as McpReadError).code).to.equal("forbidden");
        }
        expect(disconnects()).to.equal(0);
    });

    it("always releases a direct Hocuspocus connection after success or failure", async () => {
        const { service, text, disconnects } = fixture();
        await service.getItem("uid", "project-1", text.id);
        try {
            await service.getItem("uid", "project-1", "missing");
        } catch { /* expected */ }
        expect(disconnects()).to.equal(2);
    });
});
