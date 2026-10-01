import { expect } from "chai";
import * as Y from "yjs";
import { acquireDb } from "../src/mcp/relation-service.js";
import {
    createArgs,
    deferred,
    type McpTestServer,
    PROJECT,
    settleMicrotasks,
    startMcpTestServer,
    UID,
} from "./mcp-create-table-fixture.js";
import { waitFor } from "./server-create-table-fixture.js";

// Issue #5412 REQ-002 / REQ-004: state that changes while a create_table call is
// in flight. An awaited refusal is a disclosure too, and the creation revision
// describes the state that was published, not a later edit.
describe("MCP create_table in-flight changes (#5412 REQ-002, REQ-004)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    for (const dryRun of [false, true]) {
        it(`withholds a namespace refusal from a caller revoked during validation (dryRun: ${dryRun})`, async () => {
            const requestId = `revoked-during-validation-${dryRun}`;
            // Hold the real schema-validation database so the request waits inside validation.
            const lease = await acquireDb();
            let settled = false;
            const pending = t.mcp.call(
                "create_table",
                createArgs({ schemaSql: "CREATE TABLE existing_table (id TEXT)", dryRun }),
                { requestId },
            ).finally(() => settled = true);
            try {
                // The tool's and the domain's initial checks have both granted access.
                await waitFor(() => (t.checks.get(requestId) ?? 0) >= 2);
                await settleMicrotasks();
                await settleMicrotasks();
                expect(settled).to.equal(false);
                t.acl.revokeAll(PROJECT);
            } finally {
                lease.release();
            }
            const { result, payload } = await pending;
            expect(result.isError).to.equal(true);
            expect(payload.code).to.equal("forbidden");
            expect(payload.requestId).to.be.a("string");
            for (const field of ["conflictingTableId", "sqlName", "reason", "creationOutcome", "applied", "outcome"]) {
                expect(payload, field).not.to.have.property(field);
            }
            expect(JSON.stringify(result)).not.to.contain("table-existing");
        });
    }

    it("returns the published creation revision even if the Table is edited before storage confirms", async () => {
        const args = createArgs();
        const held = deferred();
        const release = deferred();
        t.seams.afterStore = async room => {
            if (room !== `projects/${PROJECT}`) return;
            held.resolve();
            await release.promise;
        };
        const pending = t.mcp.call("create_table", args);
        await held.promise;
        // Published (in memory) and still empty: this is the creation state.
        const tableId = Object.entries(await t.tables()).find(([, table]) => table.sqlName === "mcp_tasks")![0];
        const created = (await t.mcp.call("get_table", { projectId: PROJECT, tableId })).payload;
        expect(created.recordCount).to.equal(0);
        // An independent writer edits the Table room while storage is unconfirmed.
        const connection = await t.server.hocuspocus.openDirectConnection(
            `projects/${PROJECT}/tables/${tableId}`,
            { uid: UID } as never,
        );
        await connection.transact(doc => {
            const schema = (doc as unknown as Y.Doc).getText("schema");
            schema.insert(schema.length, " -- edited during creation");
        });
        await connection.disconnect();
        release.resolve();

        const applied = (await pending).payload;
        expect(applied).to.include({ applied: true, tableId, schemaSql: args.schemaSql, revision: created.revision });
        const replay = (await t.mcp.call("create_table", args)).payload;
        expect(replay).to.deep.equal({ ...applied, replayed: true });
        const current = (await t.mcp.call("get_table", { projectId: PROJECT, tableId })).payload;
        expect(current.rawSchemaSql).to.contain("edited during creation");
        expect(current.revision).not.to.equal(created.revision);
    });
});
