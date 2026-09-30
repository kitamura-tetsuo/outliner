import { expect } from "chai";
import { createArgs, type McpTestServer, PROJECT, startMcpTestServer } from "./mcp-create-table-fixture.js";

// Issue #5412 AS-002: input-shape, size, and executable-schema failures are
// bounded, machine-readable, and leave the project registry unchanged.
describe("MCP create_table input and schema validation (#5412 AS-002)", function() {
    this.timeout(60000);
    let t: McpTestServer;

    beforeEach(async () => {
        t = await startMcpTestServer();
    });
    afterEach(async () => {
        await t.stop();
    });

    const expectRefused = async (args: Record<string, unknown>, code: string, reason?: string) => {
        const before = await t.tables();
        const { result, payload } = await t.mcp.call("create_table", args);
        expect(result.isError, JSON.stringify(args)).to.equal(true);
        expect(payload.code, JSON.stringify(payload)).to.equal(code);
        expect(payload.requestId).to.be.a("string");
        if (reason) expect(payload.reason).to.equal(reason);
        expect(payload).not.to.have.property("tableId");
        expect(await t.tables()).to.deep.equal(before);
        return payload;
    };

    it("rejects malformed arguments and unsupported fields as invalid_argument", async () => {
        const valid = createArgs();
        const malformed: Record<string, unknown>[] = [
            (({ name: _name, ...rest }) => rest)(valid),
            (({ schemaSql: _schemaSql, ...rest }) => rest)(valid),
            (({ operationId: _operationId, ...rest }) => rest)(valid),
            (({ projectId: _projectId, ...rest }) => rest)(valid),
            { ...valid, name: 42 },
            { ...valid, dryRun: "yes" },
            { ...valid, operationId: "   " },
            { ...valid, operationId: "" },
            { ...valid, operationId: "x".repeat(201) },
            { ...valid, projectId: "../proj-a" },
            { ...valid, projectId: "p".repeat(129) },
            { ...valid, schemaSql: "  \n " },
            { ...valid, records: [{ id: "1" }] },
            { ...valid, pageId: "page-1" },
            { ...valid, sqlName: "other_name" },
            { ...valid, expectedRevision: "abc" },
        ];
        for (const args of malformed) await expectRefused(args, "invalid_argument");
        const extra = await expectRefused({ ...valid, records: [], preset: "tasks" }, "invalid_argument");
        expect(extra.fields).to.have.members(["records", "preset"]);
        expect(t.domainCalls).to.equal(0);
    });

    it("bounds schemaSql by UTF-8 bytes on both sides of the limit", async () => {
        const prefix = "CREATE TABLE sized (id TEXT) -- ";
        // "é" is two UTF-8 bytes; pad to exactly 16384 bytes, then one over.
        const pad = (bytes: number) => prefix + "é".repeat((bytes - prefix.length) / 2);
        const exact = pad(16384);
        expect(Buffer.byteLength(exact, "utf8")).to.equal(16384);
        const accepted = await t.mcp.call("create_table", createArgs({ schemaSql: exact, dryRun: true }));
        expect(accepted.payload).to.include({ applied: false, sqlName: "sized", schemaSql: exact });
        const over = exact + "x";
        const payload = await expectRefused(createArgs({ schemaSql: over }), "size_limit");
        expect(payload).to.include({ actualBytes: 16385, limitBytes: 16384, creationOutcome: "not_created" });
    });

    it("rejects invalid, unsupported, reserved, and occupied declarations as validation_failed", async () => {
        const invalid = [
            "CREATE TABLE broken (id TEXT",
            "CREATE TABLE one (id TEXT); CREATE TABLE two (id TEXT)",
            "CREATE TABLE copy AS SELECT 1 AS id",
            "CREATE TEMP TABLE temp_rows (id TEXT)",
            "CREATE TABLE public.qualified (id TEXT)",
            "CREATE TABLE no_columns ()",
            "DROP TABLE existing_table",
        ];
        for (const schemaSql of invalid) {
            const payload = await expectRefused(createArgs({ schemaSql }), "validation_failed", "invalid_schema");
            expect(payload).to.include({ creationOutcome: "not_created", applied: false });
            expect(payload).not.to.have.property("cause");
        }
        await expectRefused(
            createArgs({ schemaSql: "CREATE TABLE outline_items (id TEXT)" }),
            "validation_failed",
            "relation_name_unavailable",
        );
        const occupied = await expectRefused(
            createArgs({ schemaSql: "CREATE TABLE existing_table (id TEXT, extra TEXT)" }),
            "validation_failed",
            "relation_name_unavailable",
        );
        expect(occupied).to.include({ sqlName: "existing_table", conflictingTableId: "table-existing" });
        // Not converted into reuse or a suffixed Table.
        const names = Object.values(await t.tables()).map(table => table.sqlName);
        expect(names.filter(name => String(name).startsWith("existing_table"))).to.deep.equal(["existing_table"]);
    });

    it("accepts quoted columns and a semicolon inside a CHECK string, and keeps an empty name", async () => {
        const schemaSql = `CREATE TABLE quoted_rows ("Due Date" TEXT, note TEXT CHECK (note <> 'a;b'));`;
        const { payload } = await t.mcp.call("create_table", createArgs({ name: "", schemaSql }));
        expect(payload).to.include({ applied: true, displayName: "", sqlName: "quoted_rows", schemaSql });
        expect((await t.tables())[payload.tableId]).to.deep.equal({ name: "", sqlName: "quoted_rows" });
        const table = (await t.mcp.call("get_table", { projectId: PROJECT, tableId: payload.tableId })).payload;
        expect(table).to.include({ displayName: "", rawSchemaSql: schemaSql });
    });
});
