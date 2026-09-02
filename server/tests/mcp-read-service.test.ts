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
        const gridMap = new (project.ydoc.getMap("yjsGrids").constructor as new() => MapLike)();
        gridMap.set("name", "Roadmap grid");
        gridMap.set("sourceTableId", "table-1");
        gridMap.set("query", "SELECT * FROM roadmap");
        project.ydoc.getMap("yjsGrids").set("grid-1", gridMap as never);
        const tableMap = new (project.ydoc.getMap("yjsTables").constructor as new() => MapLike)();
        project.ydoc.getMap("yjsTables").set("table-1", tableMap as never);
        const calendar = layout.items.addNode("test");
        calendar.componentType = "calendar";
        calendar.calendarId = "calendar-1";
        const calendarMap = new (project.calendars.constructor as new() => MapLike)();
        calendarMap.set("name", "Roadmap calendar");
        calendarMap.set("query", "SELECT * FROM outline_items");
        calendarMap.set("groupAxes", ["owner"]);
        project.calendars.set("calendar-1", calendarMap as never);
        const scheduleMap = new (project.schedules.constructor as new() => MapLike)();
        scheduleMap.set("targetTableId", "table-1");
        project.schedules.set("rule-1", scheduleMap as never);
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

    it("resolves every canonical project-first route and encoded titles", async () => {
        const { service, project } = fixture();
        const encodedPage = project.addPage("計画 / 2026", "test");
        const origin = "https://outliner.example";

        expect(await service.resolveUrl("uid", `${origin}/MCP%20test`)).to.deep.equal({
            projectId: "project-1",
            kind: "project",
        });
        expect(await service.resolveUrl("uid", `${origin}/MCP%20test/`)).to.deep.equal({
            projectId: "project-1",
            kind: "project",
        });
        expect(await service.resolveUrl("uid", `${origin}/MCP%20test/-/schedules`)).to.deep.equal({
            projectId: "project-1",
            kind: "schedule-list",
        });
        expect(await service.resolveUrl("uid", `${origin}/MCP%20test/-/schedules/rule-1`)).to.deep.equal({
            projectId: "project-1",
            entityId: "rule-1",
            kind: "schedule",
        });
        await expectRejected(
            service.resolveUrl("uid", `${origin}/MCP%20test/-/schedules/rule-1/extra`),
            "Unsupported",
        );
        expect(await service.resolveUrl("uid", `${origin}/MCP%20test/${encodeURIComponent(encodedPage.text)}`))
            .to.deep.equal({ projectId: "project-1", pageId: encodedPage.id, kind: "page" });
        for (const [kind, id] of [["tables", "table-1"], ["grids", "grid-1"], ["calendars", "calendar-1"]]) {
            expect(await service.resolveUrl("uid", `${origin}/MCP%20test/-/${kind}/${id}`)).to.deep.equal({
                projectId: "project-1",
                entityId: id,
                kind: kind.slice(0, -1),
            });
        }

        // Production-style URL generated by projectTablePath (issue #5207).
        expect(await service.resolveUrl("uid", "https://outliner.app/MCP%20test/-/tables/table-1")).to.deep.equal({
            projectId: "project-1",
            entityId: "table-1",
            kind: "table",
        });
    });

    it("rejects incomplete, unsupported, malformed, and extra canonical route segments", async () => {
        const { service } = fixture();
        for (
            const [path, message] of [
                ["/MCP%20test/-/tables", "Unsupported"],
                ["/MCP%20test/-/widgets/widget-1", "Unsupported"],
                ["/MCP%20test/-/tables/bad%2Fid", "Invalid entity ID"],
                ["/MCP%20test/-/tables/table-1/extra", "Unsupported"],
                ["/MCP%20test//Roadmap", "Unsupported"],
                ["/MCP%20test/-/tables/%ZZ", "Malformed"],
            ]
        ) {
            await expectRejected(service.resolveUrl("uid", `https://outliner.example${path}`), message);
        }
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
        const { service, project } = fixture();
        const gridDefinition = project.ydoc.getMap<MapLike>("yjsGrids").get("grid-1")!;
        gridDefinition.set("columnOrder", ["title", "computed", "id"]);
        const MapConstructor = project.ydoc.getMap("yjsGrids").constructor as new() => MapLike;
        const components = new MapConstructor();
        const hidden = new MapConstructor();
        hidden.set("hidden", true);
        hidden.set("label", "Identifier");
        components.set("id", hidden);
        components.set("computed", new MapConstructor());
        gridDefinition.set("components", components);
        const stateBeforeRead = JSON.stringify(gridDefinition.toJSON());
        const grid = await service.getGrid("uid", "project-1", "grid-1");
        expect(grid).to.include({
            id: "grid-1",
            name: "Roadmap grid",
            sourceTableId: "table-1",
            query: "SELECT * FROM roadmap",
        });
        expect(grid.columnOrder).to.deep.equal(["title", "computed", "id"]);
        expect(grid.columns).to.deep.equal([
            { name: "title", shown: true },
            { name: "computed", shown: true },
            { name: "id", shown: false },
        ]);
        expect(grid.components).to.deep.equal({
            computed: { shown: true },
            id: { label: "Identifier", shown: false },
        });
        expect(grid.components).not.to.have.nested.property("id.hidden");
        expect(JSON.stringify(gridDefinition.toJSON())).to.equal(stateBeforeRead);
        // The revision is the same content-hash formula setViewQuery/get_grid
        // share, so it must be reusable as write_relation's/set_view_query's
        // expectedRevision precondition for this grid's saved query.
        expect(grid.revision).to.be.a("string").with.lengthOf(16);

        const calendar = await service.getCalendar("uid", "project-1", "calendar-1");
        expect(calendar).to.include({
            id: "calendar-1",
            name: "Roadmap calendar",
            query: "SELECT * FROM outline_items",
            viewType: "week",
        });
        expect(calendar.groupAxes).to.deep.equal(["owner"]);
        expect(calendar.laneOrder).to.deep.equal([]);
        expect(calendar.revision).to.be.a("string").with.lengthOf(16);
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
    toJSON(): Record<string, unknown>;
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
