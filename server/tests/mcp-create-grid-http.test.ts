import { expect } from "chai";
import * as Y from "yjs";
import { childKeys, gridIds, gridPlacements } from "./mcp-create-grid-fixture.js";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";

describe("create_grid MCP production contract (#5350)", function() {
    this.timeout(30000);

    it("previews without mutation, applies, and resolves returned identifiers through read tools", async () => {
        const f = httpGridFixture();
        const before = Y.encodeStateAsUpdate(f.project.ydoc);
        const children = childKeys(f.page);
        const history = new Y.UndoManager(f.project.ydoc.getMap("yjsGrids"), {
            trackedOrigins: new Set(["mcp-create-grid"]),
        });
        let updates = 0;
        f.project.ydoc.on("update", () => updates++);
        const preview = (await f.call("create_grid", { ...f.args, dryRun: true })).payload;
        expect(preview).to.include({ applied: false, replayed: false, name: "Task list", query: f.args.query });
        expect(preview).not.to.have.property("gridId");
        expect(preview).not.to.have.property("placementId");
        expect(Y.encodeStateAsUpdate(f.project.ydoc)).to.deep.equal(before);
        expect(updates).to.equal(0);
        expect(history.undoStack).to.have.length(0);
        const result = await f.call("create_grid", f.args);
        expect(result.isError).not.to.equal(true);
        const saved = result.payload;
        expect(saved).to.include({ applied: true, replayed: false, revision: preview.revision });
        expect(childKeys(f.page)).to.deep.equal([...children, saved.placementId]);
        const grid = (await f.call("get_grid", { projectId: f.args.projectId, gridId: saved.gridId })).payload;
        expect(grid).to.include({
            id: saved.gridId,
            sourceTableId: f.args.tableId,
            query: f.args.query,
            revision: saved.revision,
        });
        const item = (await f.call("get_item", { projectId: f.args.projectId, itemId: saved.placementId })).payload;
        expect(item).to.include({ id: saved.placementId, kind: "grid", gridId: saved.gridId, parentId: f.page.id });
        const trace = await f.call("trace_grid", { projectId: f.args.projectId, gridId: saved.gridId });
        expect(trace.isError).not.to.equal(true);
        expect(trace.payload.gridId).to.equal(saved.gridId);
        expect(trace.payload.sourceTableId).to.equal(f.args.tableId);
        expect(trace.payload.stages.find((stage: { stage: string; }) => stage.stage === "config"))
            .to.include({ observed: true, query: f.args.query, sourceTableId: f.args.tableId });
        expect(trace.payload.stages.find((stage: { stage: string; }) => stage.stage === "query-execution"))
            .to.include({ observed: true, status: "completed", rowCount: 2 });
        const retry = (await f.call("create_grid", f.args)).payload;
        expect(retry).to.deep.equal({ ...saved, replayed: true });
        expect(gridIds(f.project)).to.have.length(2);
        expect(gridPlacements(f.project)).to.deep.equal([`${saved.placementId}:${saved.gridId}`]);
        history.destroy();
    });

    it("advertises required arguments, scopes, annotations and output contract", async () => {
        const f = httpGridFixture();
        const tool = (await f.rpc("tools/list", {})).tools.find((tool: { name: string; }) =>
            tool.name === "create_grid"
        );
        expect(tool.annotations).to.include({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
        expect(tool._meta.securitySchemes).to.deep.equal([{
            type: "oauth2",
            scopes: ["outliner.read", "outliner.write"],
        }]);
        expect(tool.inputSchema.required).to.have.members(["projectId", "tableId", "pageId", "query", "operationId"]);
        expect(tool.inputSchema.properties).not.to.have.property("expectedRevision");
        expect(tool.outputSchema.properties).to.have.property("placementId");
        // Fault injection verifies common dispatch fails closed on malformed success.
        f.relations.createGrid = async () => ({ applied: true }) as never;
        const failed = await f.call("create_grid", f.args);
        expect(failed.isError).to.equal(true);
        expect(failed.payload.code).to.equal("internal_failure");
    });

    it("rejects invalid source, destination, query, identifiers and operation ID without writes", async () => {
        const f = httpGridFixture();
        const before = Y.encodeStateAsUpdate(f.project.ydoc);
        const cases: [object, string][] = [
            [{ tableId: "missing" }, "not_found"],
            [{ pageId: "missing" }, "not_found"],
            [{ pageId: f.nested.id }, "invalid_argument"],
            [{ tableId: "../other" }, "invalid_argument"],
            [{ pageId: "../other" }, "invalid_argument"],
            [{ projectId: "../other" }, "invalid_argument"],
            [{ query: " " }, "invalid_argument"],
            [{ operationId: undefined }, "invalid_argument"],
            [{ operationId: " " }, "invalid_argument"],
            [{ query: "SELECT unknown_column AS value FROM tasks" }, "validation_failed"],
            [{ query: `SELECT '${"x".repeat(70000)}' AS value FROM tasks` }, "size_limit"],
        ];
        for (const [override, code] of cases) {
            for (const dryRun of [true, false]) {
                const result = await f.call("create_grid", { ...f.args, ...override, dryRun });
                expect(result.isError).to.equal(true);
                expect(result.payload.code).to.equal(code);
                expect(Y.encodeStateAsUpdate(f.project.ydoc)).to.deep.equal(before);
            }
        }
        // Failed attempts never turn into successful replay claims.
        expect((await f.call("create_grid", f.args)).payload).to.include({ applied: true, replayed: false });
    });
});
