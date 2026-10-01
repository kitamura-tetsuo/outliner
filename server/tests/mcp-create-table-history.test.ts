import { expect } from "chai";
import * as Y from "yjs";
import { createArgs, type McpTestServer, PROJECT, startMcpTestServer, token, UID } from "./mcp-create-table-fixture.js";
import { seedProject } from "./server-create-table-fixture.js";

/** The client's renameTable / removeTable registry mutations (client/src/services/yjstable/tableDocs.ts). */
async function editRegistry(t: McpTestServer, edit: (registry: Y.Map<Y.Map<unknown>>) => void) {
    const connection = await t.server.hocuspocus.openDirectConnection(`projects/${PROJECT}`, {} as never);
    await connection.transact(doc => edit((doc as unknown as Y.Doc).getMap<Y.Map<unknown>>("yjsTables")));
    await connection.disconnect();
}

// Issue #5412 AS-005: a retained replay is historical. It never rewrites later
// edits, never resurrects a deleted Table, and never crosses user/project scope.
describe("MCP create_table replay is historical and scoped (#5412 AS-005)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    it("replays the original creation after schema, record, and name changes without undoing them", async () => {
        const args = createArgs();
        const created = (await t.mcp.call("create_table", args)).payload;
        const { tableId } = created;
        const migrated = await t.mcp.call("update_table_schema", {
            projectId: PROJECT,
            tableId,
            schemaSql: `${args.schemaSql.slice(0, -1)}, due TEXT)`,
            expectedRevision: created.revision,
        });
        expect(migrated.payload.applied).to.equal(true);
        await t.mcp.call("write_relation", {
            projectId: PROJECT,
            relation: "mcp_tasks",
            write: { op: "INSERT", values: { id: "t1", title: "later", done: true, due: "2026-10-01" } },
        });
        await editRegistry(t, registry => registry.get(tableId)!.set("name", "Renamed Tasks"));
        const current = (await t.mcp.call("get_table", { projectId: PROJECT, tableId })).payload;
        expect(current).to.include({ displayName: "Renamed Tasks", recordCount: 1 });
        expect(current.rawSchemaSql).to.contain("due TEXT");

        const replay = await t.mcp.call("create_table", args);
        expect(replay.payload).to.deep.equal({ ...created, replayed: true });
        expect(replay.payload.revision).not.to.equal(current.revision);
        expect((await t.mcp.call("get_table", { projectId: PROJECT, tableId })).payload).to.deep.equal(current);
        expect(t.domainCalls).to.equal(1);
    });

    it("does not resurrect or replace a deleted Table", async () => {
        const args = createArgs();
        const created = (await t.mcp.call("create_table", args)).payload;
        const before = Object.keys(await t.tables()).filter(id => id !== created.tableId);
        await editRegistry(t, registry => registry.delete(created.tableId));
        const missing = await t.mcp.call("get_table", { projectId: PROJECT, tableId: created.tableId });
        expect(missing.payload.code).to.equal("not_found");

        const replay = await t.mcp.call("create_table", args);
        expect(replay.payload).to.deep.equal({ ...created, replayed: true });
        expect(Object.keys(await t.tables())).to.deep.equal(before);
        expect(t.domainCalls).to.equal(1);
        expect((await t.mcp.call("get_table", { projectId: PROJECT, tableId: created.tableId })).payload.code)
            .to.equal("not_found");
    });

    it("isolates identical operation IDs across users and projects", async () => {
        const other = "mcp-table-user-2";
        t.acl.grant("projectUsers", PROJECT, other);
        t.acl.grant("projectUsers", "proj-b", UID);
        await seedProject(t.server.hocuspocus, "proj-b");
        const operationId = "shared-operation-id";
        const mine = (await t.mcp.call("create_table", createArgs({ operationId }))).payload;
        const theirs = (await t.mcp.call(
            "create_table",
            createArgs({ operationId, name: "Theirs", schemaSql: "CREATE TABLE their_rows (id TEXT)" }),
            { bearer: token(other) },
        )).payload;
        const elsewhere = (await t.mcp.call("create_table", createArgs({ operationId, projectId: "proj-b" }))).payload;
        for (const payload of [mine, theirs, elsewhere]) expect(payload).to.include({ applied: true, replayed: false });
        expect(new Set([mine.tableId, theirs.tableId, elsewhere.tableId]).size).to.equal(3);
        expect(theirs).to.include({ displayName: "Theirs", sqlName: "their_rows" });
        expect(t.domainCalls).to.equal(3);
        // Each scope replays only its own outcome.
        expect((await t.mcp.call("create_table", createArgs({ operationId }))).payload.tableId).to.equal(mine.tableId);
        const theirReplay = await t.mcp.call("create_table", createArgs({ operationId }), { bearer: token(other) });
        expect(theirReplay.payload).to.deep.equal({ ...theirs, replayed: true });
        expect(t.domainCalls).to.equal(3);
    });
});
