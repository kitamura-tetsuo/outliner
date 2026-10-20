import { expect } from "chai";
import { describe, it } from "mocha";
import { toolOutputSchemas } from "../src/mcp/tool-output-schemas.js";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";
describe("public source diagnostic schema", function() {
    this.timeout(30000);
    it("validates actual server outputs and omits internal schema revisions at every depth", async () => {
        const f = httpGridFixture();
        const sentinel = "protected-schema-comment".repeat(3000);
        f.tasks.getText("schema").insert(f.tasks.getText("schema").length, ` /* ${sentinel} */`);
        const created = (await f.call("create_grid", f.args)).payload;
        for (const name of ["create_grid", "get_grid", "trace_grid"] as const) {
            const output = name === "create_grid"
                ? created
                : (await f.call(name, { projectId: "project-1", gridId: created.gridId })).payload;
            expect(toolOutputSchemas[name].safeParse(output).success, JSON.stringify(output)).to.equal(true);
            const diagnostics = JSON.stringify(output.sourceDiagnostics);
            expect(diagnostics).not.to.contain("schemaRevision").and.not.to.contain(sentinel);
            expect(diagnostics.length).to.be.lessThan(4000);
        }
        expect(f.tasks.getText("schema").toString()).to.contain(sentinel);
    });
});
