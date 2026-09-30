import { expect } from "chai";
import { createArgs, type McpTestServer, PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";

// Issue #5412 AS-006: a confirmed pre-publication refusal may be retried with
// the same operation ID, while an unknown publication outcome is retained and
// replayed as unknown without a second domain attempt.
describe("MCP create_table refusal and unknown outcomes (#5412 AS-006)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    it("reports a pre-publication failure as not created and lets the same operation ID succeed", async () => {
        const args = createArgs();
        const before = await t.tables();
        t.seams.afterStore = room => {
            if (room.includes("/tables/")) throw new Error("private table store failure");
        };
        const failed = await t.mcp.call("create_table", args);
        expect(failed.result.isError).to.equal(true);
        expect(failed.payload).to.include({ code: "internal_failure", creationOutcome: "not_created", applied: false });
        expect(failed.payload.requestId).to.be.a("string");
        expect(failed.payload).not.to.have.property("tableId");
        expect(JSON.stringify(failed.result)).not.to.contain("private table store failure");
        expect(await t.tables()).to.deep.equal(before);

        t.seams.afterStore = undefined;
        const retried = await t.mcp.call("create_table", args);
        expect(retried.payload).to.include({ applied: true, replayed: false, sqlName: "mcp_tasks" });
        expect(t.domainCalls).to.equal(2);
        expect(Object.keys(await t.tables())).to.have.length(Object.keys(before).length + 1);
    });

    it("retains an unknown publication outcome and replays it without a new attempt", async () => {
        const args = createArgs();
        const before = await t.tables();
        // The real store runs; only its acknowledgement is lost afterwards.
        t.seams.afterStore = room => {
            if (room === `projects/${PROJECT}`) throw new Error("private acknowledgement failure");
        };
        const unknown = await t.mcp.call("create_table", args);
        expect(unknown.result.isError).to.equal(true);
        expect(unknown.payload).to.include({
            code: "internal_failure",
            creationOutcome: "unknown",
            applied: null,
            replayed: false,
        });
        expect(unknown.payload.requestId).to.be.a("string");
        expect(unknown.payload.tableId).to.be.a("string");
        expect(unknown.payload).not.to.have.property("revision");
        expect(JSON.stringify(unknown.result)).not.to.contain("private acknowledgement failure");
        expect(JSON.stringify(unknown.result)).not.to.match(/roll(ed)?\s*back/i);
        // The candidate was published in the live room; nothing was rolled back.
        expect((await t.tables())[unknown.payload.tableId]).to.deep.equal({ name: "MCP Tasks", sqlName: "mcp_tasks" });

        t.seams.afterStore = undefined;
        const replay = await t.mcp.call("create_table", args);
        expect(replay.result.isError).to.equal(true);
        expect(replay.payload).to.deep.equal({
            ...unknown.payload,
            replayed: true,
            requestId: replay.payload.requestId,
        });
        expect(t.domainCalls).to.equal(1);
        expect(Object.keys(await t.tables())).to.have.length(Object.keys(before).length + 1);
    });
});
