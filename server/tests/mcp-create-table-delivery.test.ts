import { expect } from "chai";
import { toolOutputSchemas } from "../src/mcp/tool-output-schemas.js";
import { createArgs, type McpTestServer, startMcpTestServer } from "./mcp-create-table-fixture.js";

// Issue #5412 AS-009: successful output is validated against the advertised
// output schema and fails closed, without claiming not-created or forgetting
// the remembered domain outcome.
describe("MCP create_table structured output and delivery failure (#5412 AS-009)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    it("advertises an output schema that rejects preview IDs and incomplete applies", () => {
        const schema = toolOutputSchemas.create_table;
        const base = { displayName: "T", sqlName: "t", schemaSql: "CREATE TABLE t (id TEXT)" };
        expect(schema.safeParse({ ...base, applied: false, replayed: false }).success).to.equal(true);
        expect(schema.safeParse({ ...base, applied: true, replayed: false, tableId: "a", revision: "r" }).success)
            .to.equal(true);
        for (
            const malformed of [
                { ...base, applied: false, replayed: false, tableId: "a" },
                { ...base, applied: false, replayed: false, revision: "r" },
                { ...base, applied: false, replayed: false, priorRevision: "r" },
                { ...base, applied: false, replayed: true },
                { ...base, applied: true, replayed: false, tableId: "a" },
                { ...base, applied: true, replayed: false, tableId: "a", revision: 7 },
            ]
        ) {
            expect(schema.safeParse(malformed).success, JSON.stringify(malformed)).to.equal(false);
        }
    });

    it("fails closed on a malformed result, keeps the created outcome, and never re-executes", async () => {
        const args = createArgs();
        const before = Object.keys(await t.tables()).length;
        t.seams.deliver = outcome => ({ ...outcome, revision: 7 }) as never;
        const failed = await t.mcp.call("create_table", args);
        expect(failed.result.isError).to.equal(true);
        expect(failed.result).not.to.have.property("structuredContent");
        expect(failed.payload).to.include({ code: "internal_failure", creationOutcome: "created", applied: true });
        expect(failed.payload).not.to.have.property("revision");
        expect(Object.keys(await t.tables())).to.have.length(before + 1);

        const retry = await t.mcp.call("create_table", args);
        expect(retry.payload).to.include({ code: "internal_failure", creationOutcome: "created", replayed: true });
        expect(t.domainCalls).to.equal(1);
        expect(Object.keys(await t.tables())).to.have.length(before + 1);
    });

    it("fails closed on a malformed preview without creating anything", async () => {
        const before = await t.tables();
        t.seams.deliver = outcome => ({ ...outcome, sqlName: "not a sql name" });
        const failed = await t.mcp.call("create_table", createArgs({ dryRun: true }));
        expect(failed.payload).to.include({ code: "internal_failure" });
        expect(failed.payload).not.to.have.property("creationOutcome");
        expect(await t.tables()).to.deep.equal(before);
    });
});
