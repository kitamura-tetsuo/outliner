import { expect } from "chai";
import { toolOutputSchemas } from "../src/mcp/tool-output-schemas.js";
import { createArgs, type McpTestServer, PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";
import { storedRooms } from "./server-create-table-fixture.js";

// Issue #5412 AS-003: a dry run validates against current state without
// creating, reserving, or consuming anything, including its operation ID.
describe("MCP create_table dry run (#5412 AS-003)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    it("previews without a room, registry entry, or replay entry, then applies once", async () => {
        const args = createArgs();
        const tablesBefore = await t.tables();
        const roomsBefore = storedRooms(t.dir);
        const preview = await t.mcp.call("create_table", { ...args, dryRun: true });
        expect(preview.result.isError).to.equal(undefined);
        expect(toolOutputSchemas.create_table.safeParse(preview.payload).success).to.equal(true);
        expect(preview.payload).to.deep.equal({
            applied: false,
            replayed: false,
            displayName: "MCP Tasks",
            sqlName: "mcp_tasks",
            schemaSql: args.schemaSql,
        });
        expect(await t.tables()).to.deep.equal(tablesBefore);
        expect(storedRooms(t.dir)).to.deep.equal(roomsBefore);
        // No candidate Table room was opened (only the seeded Table's room exists).
        expect([...t.server.hocuspocus.documents.keys()].filter(room => room.includes("/tables/")))
            .to.satisfy((rooms: string[]) => rooms.every(room => room.endsWith("/tables/table-existing")));
        expect(t.domainCalls).to.equal(0);

        // The same operation ID then executes once instead of replaying the preview.
        const applied = await t.mcp.call("create_table", args);
        expect(applied.payload).to.include({ applied: true, replayed: false, sqlName: "mcp_tasks" });
        expect(t.domainCalls).to.equal(1);
        const replay = await t.mcp.call("create_table", args);
        expect(replay.payload).to.deep.equal({ ...applied.payload, replayed: true });
        expect(t.domainCalls).to.equal(1);
    });

    it("never consults or alters a retained result for the same operation ID", async () => {
        const args = createArgs();
        const created = (await t.mcp.call("create_table", args)).payload;
        // A currently valid, different candidate under the retained operation ID.
        const other = { ...args, name: "Other", schemaSql: "CREATE TABLE other_rows (id TEXT)", dryRun: true };
        const preview = await t.mcp.call("create_table", other);
        expect(preview.payload).to.deep.equal({
            applied: false,
            replayed: false,
            displayName: "Other",
            sqlName: "other_rows",
            schemaSql: other.schemaSql,
        });
        // A dry run of the retained candidate itself is judged on current state:
        // its name is now occupied (by the Table this operation created).
        const occupied = await t.mcp.call("create_table", { ...args, dryRun: true });
        expect(occupied.payload).to.include({ code: "validation_failed", reason: "relation_name_unavailable" });
        expect(occupied.payload).not.to.have.property("creationOutcome");
        // The retained result is untouched and still replays.
        expect((await t.mcp.call("create_table", args)).payload).to.deep.equal({ ...created, replayed: true });
        expect(t.domainCalls).to.equal(1);
    });

    it("does not reserve the name: a claim made after the preview fails the apply", async () => {
        const args = createArgs({ schemaSql: "CREATE TABLE contested (id TEXT)" });
        expect((await t.mcp.call("create_table", { ...args, dryRun: true })).payload).to.include({
            applied: false,
            sqlName: "contested",
        });
        const competitor = await t.mcp.call("create_table", createArgs({ name: "First", schemaSql: args.schemaSql }));
        expect(competitor.payload.applied).to.equal(true);
        const applied = await t.mcp.call("create_table", args);
        expect(applied.payload).to.include({
            code: "validation_failed",
            reason: "relation_name_unavailable",
            creationOutcome: "not_created",
            conflictingTableId: competitor.payload.tableId,
        });
        const tables = Object.values(await t.tables()).filter(table => table.sqlName === "contested");
        expect(tables).to.deep.equal([{ name: "First", sqlName: "contested" }]);
        const relations = (await t.mcp.call("list_relations", { projectId: PROJECT })).payload.relations;
        expect(relations.filter((relation: { relation: string; }) => relation.relation === "contested")).to.have
            .length(1);
    });
});
