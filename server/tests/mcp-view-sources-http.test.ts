import { expect } from "chai";
import * as Y from "yjs";
import { gridIds, gridPlacements } from "./mcp-create-grid-fixture.js";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";

describe("source-independent MCP Grid contract", function() {
    this.timeout(30000);
    it("advertises current arguments, validates ordinary inputs and denies writes before parsing", async () => {
        const f = httpGridFixture();
        const tool = (await f.rpc("tools/list", {})).tools.find((tool: { name: string; }) =>
            tool.name === "create_grid"
        );
        expect(tool.inputSchema.required).to.have.members(["projectId", "pageId", "query", "operationId"]);
        expect(tool.inputSchema.properties).not.to.have.property("tableId");
        expect(tool.inputSchema.properties).to.have.property("insertTargetTableId");
        expect(tool.outputSchema.properties).to.have.property("sourceDiagnostics");
        for (
            const override of [{ query: " " }, { query: 1 }, { operationId: "" }, { insertTargetTableId: "../foreign" }]
        ) {
            expect((await f.call("create_grid", { ...f.args, ...override })).payload.code).to.equal("invalid_argument");
        }
        expect((await f.call("create_grid", {}, f.app("outliner.read"))).payload.code).to.equal("forbidden");
    });
    it("creates, inspects, traces and replays a query-only Grid without persisting automatic intent", async () => {
        const f = httpGridFixture();
        const before = Y.encodeStateAsUpdate(f.project.ydoc);
        const preview = await f.call("create_grid", { ...f.args, dryRun: true });
        expect(preview.isError, JSON.stringify(preview)).not.to.equal(true);
        expect(preview.payload).not.to.have.property("gridId");
        expect(Y.encodeStateAsUpdate(f.project.ydoc)).to.deep.equal(before);
        const created = await f.call("create_grid", f.args);
        expect(created.isError, JSON.stringify(created)).not.to.equal(true);
        const saved = created.payload;
        const entry = f.project.ydoc.getMap<Y.Map<unknown>>("yjsGrids").get(saved.gridId)!;
        expect(entry.has("sourceTableId")).to.equal(false);
        expect(entry.has("insertTargetTableId")).to.equal(false);
        expect(entry.get("query")).to.equal(f.args.query);
        expect(saved.sourceDiagnostics.insert).to.include({ mode: "automatic" });
        for (const name of ["get_grid", "trace_grid"]) {
            const result = await f.call(name, { projectId: f.args.projectId, gridId: saved.gridId });
            expect(result.isError, JSON.stringify(result)).not.to.equal(true);
            expect(result.payload.sourceDiagnostics.dependencies.relations.map((source: { id: string; }) => source.id))
                .to.deep.equal(["table-tasks"]);
            expect(result.payload).not.to.have.property("sourceTableId");
        }
        expect((await f.call("create_grid", f.args)).payload).to.deep.equal({ ...saved, replayed: true });
        expect(gridIds(f.project)).to.have.length(2);
        expect(gridPlacements(f.project)).to.deep.equal([`${saved.placementId}:${saved.gridId}`]);
    });
    it("retains empty UNION suppliers and strictly rejects non-suppliers before either publication", async () => {
        const f = httpGridFixture();
        const query = "SELECT id AS id FROM tasks UNION ALL SELECT id AS id FROM people WHERE FALSE";
        const omitted = await f.call("create_grid", { ...f.args, query });
        expect(omitted.isError, JSON.stringify(omitted)).not.to.equal(true);
        expect(omitted.payload.sourceDiagnostics.insert.mode).to.equal("selection-required");
        const configured = await f.call("create_grid", {
            ...f.args,
            query,
            operationId: "configured",
            insertTargetTableId: "table-people",
        });
        expect(configured.payload.sourceDiagnostics.insert.mode).to.equal("configured");
        f.addTable("table-unrelated", "Unrelated", "unrelated", "CREATE TABLE unrelated (id TEXT PRIMARY KEY)", []);
        const before = Y.encodeStateAsUpdate(f.project.ydoc);
        const invalidUnion = await f.call("create_grid", {
            ...f.args,
            query,
            operationId: "invalid-union",
            insertTargetTableId: "table-unrelated",
        });
        expect(invalidUnion.payload.code).to.equal("invalid_argument");
        expect(Y.encodeStateAsUpdate(f.project.ydoc)).to.deep.equal(before);
        const failed = await f.call("create_grid", {
            ...f.args,
            query: "SELECT id AS id FROM tasks WHERE EXISTS (SELECT 1 FROM people)",
            operationId: "invalid",
            insertTargetTableId: "table-people",
        });
        expect(failed.payload.code).to.equal("invalid_argument");
        expect(Y.encodeStateAsUpdate(f.project.ydoc)).to.deep.equal(before);
    });
    it("supports constants and system queries without registered user Tables", async () => {
        const f = httpGridFixture();
        f.project.ydoc.getMap("yjsTables").clear();
        for (const query of ["SELECT 1 AS answer", "SELECT id AS id, text AS text FROM outline_items"]) {
            const created = await f.call("create_grid", { ...f.args, query, operationId: query });
            expect(created.isError, JSON.stringify(created)).not.to.equal(true);
            const read = await f.call("get_grid", { projectId: f.args.projectId, gridId: created.payload.gridId });
            expect(read.isError, JSON.stringify(read)).not.to.equal(true);
            expect(read.payload.sourceDiagnostics.dependencies.status).to.equal("proven");
            expect(read.payload.sourceDiagnostics.dependencies.relations.map((source: { id: string; }) => source.id)).to
                .deep.equal(query.includes("outline_items") ? ["outline_items"] : []);
            expect(f.project.ydoc.getMap("yjsTables").size).to.equal(0);
        }
    });
    it("reports accepted catalog reads as unknown instead of relation-free", async () => {
        const f = httpGridFixture();
        const created = await f.call("create_grid", { ...f.args, query: "SELECT oid AS oid FROM pg_catalog.pg_class" });
        expect(created.isError, JSON.stringify(created)).not.to.equal(true);
        expect(created.payload.sourceDiagnostics.dependencies.status).to.equal("unknown");
        expect(created.payload.sourceDiagnostics.insert.mode).to.equal("unavailable");
        expect(created.payload.sourceDiagnostics.insert.reason).to.contain("Native bindings");
    });
});
