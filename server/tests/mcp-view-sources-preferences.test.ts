import { expect } from "chai";
import * as Y from "yjs";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";

describe("Grid preference and query incarnation", function() {
    this.timeout(30000);
    it("preserves a dormant preference after SQL changes and leaves explicit relation writes independent", async () => {
        const f = httpGridFixture();
        const union = "SELECT id AS id FROM tasks UNION ALL SELECT id AS id FROM people";
        const created =
            (await f.call("create_grid", { ...f.args, query: union, insertTargetTableId: "table-people" })).payload;
        expect(created.applied).to.equal(true);
        const updated = await f.call("update_grid_query", {
            projectId: f.args.projectId,
            gridId: created.gridId,
            query: "SELECT id AS id FROM tasks",
            expectedRevision: created.revision,
            operationId: "singleton",
        });
        expect(updated.isError, JSON.stringify(updated)).not.to.equal(true);
        const read = (await f.call("get_grid", { projectId: f.args.projectId, gridId: created.gridId })).payload;
        expect(read.insertTargetTableId).to.equal("table-people");
        expect(read.sourceDiagnostics.insert).to.deep.include({
            mode: "automatic",
            preferenceDiagnostic: {
                code: "not-a-supplier",
                tableId: "table-people",
                message: "The saved Table is not a row supplier of the current query",
            },
        });
        expect(read.sourceDiagnostics.insert.target.id).to.equal("table-tasks");
        const peopleBefore = Y.encodeStateAsUpdate(f.people);
        const write = await f.call("write_relation", {
            projectId: f.args.projectId,
            relation: "tasks",
            write: { op: "INSERT", values: { id: "explicit-task", title: "Explicit" } },
        });
        expect(write.isError, JSON.stringify(write)).not.to.equal(true);
        expect(f.tasks.getMap("data").has("explicit-task")).to.equal(true);
        expect(Y.encodeStateAsUpdate(f.people)).to.deep.equal(peopleBefore);
    });
    it("refuses a query update when the actual Grid registry entry was replaced during validation", async () => {
        const f = httpGridFixture();
        const created = (await f.call("create_grid", f.args)).payload;
        const registry = f.project.ydoc.getMap<Y.Map<unknown>>("yjsGrids");
        const replacement = new Y.Map<unknown>();
        replacement.set("query", "SELECT 7 AS answer");
        const service = f.relations as unknown as { options: { beforeGridQueryPublication?: () => Promise<void>; }; };
        service.options.beforeGridQueryPublication = async () => {
            registry.delete(created.gridId);
            registry.set(created.gridId, replacement);
        };
        const updated = await f.call("update_grid_query", {
            projectId: f.args.projectId,
            gridId: created.gridId,
            query: "SELECT id AS id FROM tasks",
            expectedRevision: created.revision,
            operationId: "replaced",
        });
        expect(updated.payload.code).to.equal("stale_revision");
        expect(registry.get(created.gridId)).to.equal(replacement);
        expect(replacement.get("query")).to.equal("SELECT 7 AS answer");
    });
});
