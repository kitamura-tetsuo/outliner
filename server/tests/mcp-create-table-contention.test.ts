import { expect } from "chai";
import {
    createArgs,
    deferred,
    type McpTestServer,
    PROJECT,
    startMcpTestServer,
    UID,
} from "./mcp-create-table-fixture.js";
import { projectState, waitFor, withRoom } from "./server-create-table-fixture.js";

// Issue #5412 AS-008: a SQL-name claim that becomes visible while an MCP
// creation is in flight is not hidden by the MCP replay layer, and overlapping
// creations of one name under different operation IDs publish at most one Table.
describe("MCP create_table SQL-name contention (#5412 AS-008)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    it("refuses publication after a competing claim appears during the request", async () => {
        const schemaSql = "CREATE TABLE contested (id TEXT)";
        const reached = deferred();
        const release = deferred();
        t.seams.beforePublication = async () => {
            reached.resolve();
            await release.promise;
        };
        const pending = t.mcp.call("create_table", createArgs({ schemaSql }));
        await reached.promise;
        // The production server writer publishes a competing claim meanwhile.
        const competitor = await t.server.tableCreation.createTable(UID, PROJECT, { name: "Competitor", schemaSql });
        if (competitor.status !== "created") throw new Error("competitor was not created");
        const observed = await withRoom(t.server.hocuspocus, `projects/${PROJECT}`, projectState);
        expect(observed.tables[competitor.tableId]).to.include({ name: "Competitor", sqlName: "contested" });

        release.resolve();
        const { result, payload } = await pending;
        expect(result.isError).to.equal(true);
        expect(payload).to.include({
            code: "validation_failed",
            reason: "relation_name_unavailable",
            sqlName: "contested",
            conflictingTableId: competitor.tableId,
            creationOutcome: "not_created",
        });
        // The competitor and every unrelated root are preserved.
        expect(await withRoom(t.server.hocuspocus, `projects/${PROJECT}`, projectState)).to.deep.equal(observed);
    });

    it("publishes at most one Table for overlapping creations under different operation IDs", async () => {
        const schemaSql = "CREATE TABLE raced (id TEXT)";
        let arrivals = 0;
        const release = deferred();
        t.seams.beforePublication = async () => {
            arrivals++;
            await release.promise;
        };
        const calls = ["race-a", "race-b", "race-c"].map(operationId =>
            t.mcp.call("create_table", createArgs({ operationId, schemaSql }))
        );
        // Every attempt has prepared its room and is contending for publication.
        await waitFor(() => arrivals === 3);
        expect(t.domainCalls).to.equal(3);
        release.resolve();
        const payloads = (await Promise.all(calls)).map(call => call.payload);
        const created = payloads.filter(payload => payload.applied === true);
        expect(created).to.have.length(1);
        for (const payload of payloads.filter(payload => payload.applied !== true)) {
            expect(payload).to.include({
                code: "validation_failed",
                reason: "relation_name_unavailable",
                conflictingTableId: created[0].tableId,
            });
        }
        const tables = Object.entries(await t.tables()).filter(([, table]) => table.sqlName === "raced");
        expect(tables.map(([id]) => id)).to.deep.equal([created[0].tableId]);
    });
});
