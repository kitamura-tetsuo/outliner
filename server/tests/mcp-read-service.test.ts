import { expect } from "chai";
import { McpReadError, OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { ProjectDirectoryError } from "../src/project-directory.js";
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
        const gridMap = new (project.ydoc.getMap("yjsGrids").constructor as new() => MapLike)();
        gridMap.set("name", "Roadmap grid");
        gridMap.set("sourceTableId", "table-1");
        gridMap.set("query", "SELECT * FROM roadmap");
        project.ydoc.getMap("yjsGrids").set("grid-1", gridMap as never);
        const calendar = layout.items.addNode("test");
        calendar.componentType = "calendar";
        calendar.calendarId = "calendar-1";
        const calendarMap = new (project.calendars.constructor as new() => MapLike)();
        calendarMap.set("name", "Roadmap calendar");
        calendarMap.set("query", "SELECT * FROM outline_items");
        calendarMap.set("groupAxes", ["owner"]);
        project.calendars.set("calendar-1", calendarMap as never);
        let disconnects = 0;
        const service = new OutlinerReadService(
            {
                openDirectConnection: async () => ({
                    document: project.ydoc,
                    disconnect: async () => {
                        disconnects++;
                    },
                }),
            } as never,
            async () => allowed,
            async () => [{ projectId: "project-1", title: "MCP test" }],
        );
        return { service, project, page, text, layout, grid, calendar, disconnects: () => disconnects };
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

    it("resolves title-based project and page URLs to stable identifiers", async () => {
        const { service, page } = fixture();
        expect(await service.resolveUrl("uid", "https://outliner.example/MCP%20test/Roadmap")).to.deep.equal({
            projectId: "project-1",
            pageId: page.id,
            kind: "page",
        });
        await expectRejected(service.resolveUrl("uid", "javascript:alert(1)"), "Unsupported");
        await expectRejected(service.resolveUrl("uid", "https://outliner.example/project/%2Fsecret"), "not found");
        expect(await service.resolveUrl("uid", "https://outliner.example/grids/MCP%20test/grid-1")).to.deep.equal({
            projectId: "project-1",
            entityId: "grid-1",
            kind: "grid",
        });
        await expectRejected(
            service.resolveUrl("uid", "https://outliner.example/grids/MCP%20test/missing"),
            "grid not found",
        );
    });

    it("resolves from the canonical resource descriptor without consulting the Yjs title", async () => {
        const { service, project, page } = fixture();
        project.title = "4a934322-05de-4c97-932c-bc87fb43e18c";
        expect(await service.resolveUrl("uid", "https://outliner.example/MCP%20test/Roadmap")).to.deep.equal({
            projectId: "project-1",
            pageId: page.id,
            kind: "page",
        });
    });

    it("returns complete lightweight Grid and Calendar configuration", async () => {
        const { service } = fixture();
        expect(await service.getGrid("uid", "project-1", "grid-1")).to.deep.equal({
            id: "grid-1",
            name: "Roadmap grid",
            sourceTableId: "table-1",
            query: "SELECT * FROM roadmap",
            columnOrder: [],
            components: {},
        });
        expect(await service.getCalendar("uid", "project-1", "calendar-1")).to.deep.equal({
            id: "calendar-1",
            name: "Roadmap calendar",
            query: "SELECT * FROM outline_items",
            viewType: "week",
            groupAxes: ["owner"],
            laneOrder: [],
        });
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

    it("enforces the same ACL before every project-scoped read capability", async () => {
        const { service, text, disconnects } = fixture(false);
        const reads = [
            service.getItem("uid", "project-1", text.id),
            service.getSubtree("uid", "project-1", text.id),
            service.getAncestors("uid", "project-1", text.id),
            service.searchItems("uid", "project-1", "ship"),
            service.getGrid("uid", "project-1", "grid-1"),
            service.getCalendar("uid", "project-1", "calendar-1"),
        ];
        for (const read of reads) {
            await expectRejected(read, "Project is inaccessible");
        }
        expect(disconnects()).to.equal(0);
    });

    it("does not reveal whether an inaccessible URL target exists", async () => {
        const { service } = fixture(false);
        await expectRejected(service.resolveUrl("uid", "https://outliner.example/MCP%20test/Roadmap"), "not found");
    });

    it("includes safe diagnostic info in URL resolution errors", async () => {
        const { service } = fixture();
        try {
            await service.resolveUrl("uid", "https://outliner.example/MCP%20test/missing");
            expect.fail("expected rejection");
        } catch (error) {
            expect(error).to.be.instanceOf(McpReadError);
            const mcpError = error as McpReadError;
            expect(mcpError.code).to.equal("not_found");
            expect(mcpError.debug).to.deep.include({
                stage: "page_lookup",
                requestedProjectTitle: "MCP test",
                requestedPageTitle: "missing",
            });
        }

        try {
            await service.resolveUrl("uid", "https://outliner.example/MissingProject");
            expect.fail("expected rejection");
        } catch (error) {
            expect(error).to.be.instanceOf(McpReadError);
            const mcpError = error as McpReadError;
            expect(mcpError.code).to.equal("not_found");
            expect(mcpError.debug).to.deep.include({
                stage: "project_title_matching",
                requestedProjectTitle: "MissingProject",
                accessibleProjectCount: 1,
            });
        }
    });

    it("identifies a malformed canonical directory record before title matching", async () => {
        const service = new OutlinerReadService(
            {} as never,
            async () => true,
            async () => {
                throw new ProjectDirectoryError("invalid_title", "Project title must not be a project ID", {
                    internalOperation: "descriptorFromData.normalizeProjectTitle",
                    projectId: "00000000-0000-0000-0000-000000000000",
                    descriptorState: "invalid_title",
                    storedTitleEqualsProjectId: true,
                });
            },
        );
        try {
            await service.resolveUrl("uid", "https://outliner.example/tetsuo/claude%20code?secret=hidden");
            expect.fail("expected rejection");
        } catch (error) {
            const mcpError = error as McpReadError;
            expect(mcpError.debug).to.deep.include({
                inputUrl: "https://outliner.example/tetsuo/claude%20code",
                pathname: "/tetsuo/claude%20code",
                projectSegment: "tetsuo",
                interpretedAs: "projectTitle",
                stage: "project_directory_read",
                internalOperation: "descriptorFromData.normalizeProjectTitle",
                directoryErrorCode: "invalid_title",
                projectId: "00000000-0000-0000-0000-000000000000",
                descriptorState: "invalid_title",
                storedTitleEqualsProjectId: true,
            });
            expect(JSON.stringify(mcpError.debug)).not.to.include("hidden");
        }
    });

    it("distinguishes discovery and authorization re-check failures", async () => {
        const noProjects = new OutlinerReadService({} as never, async () => true, async () => []);
        await expectStage(noProjects.resolveUrl("uid", "https://outliner.example/missing"), "project_discovery");

        const { service } = fixture(false);
        await expectStage(
            service.resolveUrl("uid", "https://outliner.example/MCP%20test"),
            "authorization_recheck",
        );
    });

    it("does not copy credential-like input into URL diagnostics", async () => {
        const { service } = fixture();
        try {
            await service.resolveUrl("uid", "not a URL Authorization: Bearer secret-token");
            expect.fail("expected rejection");
        } catch (error) {
            const diagnostics = JSON.stringify((error as McpReadError).debug);
            expect(diagnostics).not.to.include("secret-token");
            expect((error as McpReadError).debug).to.include({ stage: "url_parsing", inputLength: 44 });
        }

        try {
            await service.resolveUrl("uid", "https://outliner.example/Authorization:%20Bearer%20secret-token/%ZZ");
            expect.fail("expected rejection");
        } catch (error) {
            const diagnostics = JSON.stringify((error as McpReadError).debug);
            expect(diagnostics).not.to.include("secret-token");
            expect((error as McpReadError).debug?.stage).to.equal("url_decoding");
        }
    });

    it("rejects malformed identifiers and out-of-contract result bounds", async () => {
        const { service, page } = fixture();
        await expectRejected(service.getItem("uid", "project/escape", page.id), "Invalid project ID");
        await expectRejected(
            Promise.resolve().then(() => service.getItem("uid", "project-1", "bad/item")),
            "Invalid item ID",
        );
        await expectRejected(
            Promise.resolve().then(() => service.getSubtree("uid", "project-1", page.id, 11, 1)),
            "depth must be",
        );
        await expectRejected(
            Promise.resolve().then(() => service.getSubtree("uid", "project-1", page.id, 1, 501)),
            "depth must be",
        );
        await expectRejected(
            Promise.resolve().then(() => service.searchItems("uid", "project-1", "ship", 101)),
            "limit must be",
        );
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

interface MapLike {
    set(key: string, value: unknown): unknown;
}

async function expectRejected(promise: Promise<unknown>, message: string): Promise<void> {
    try {
        await promise;
        expect.fail("expected rejection");
    } catch (error) {
        expect(error).to.be.instanceOf(McpReadError);
        expect((error as Error).message.toLowerCase()).to.include(message.toLowerCase());
    }
}

async function expectStage(promise: Promise<unknown>, stage: string): Promise<void> {
    try {
        await promise;
        expect.fail("expected rejection");
    } catch (error) {
        expect(error).to.be.instanceOf(McpReadError);
        expect((error as McpReadError).debug?.stage).to.equal(stage);
    }
}
