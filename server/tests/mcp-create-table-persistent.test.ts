import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { toolOutputSchemas } from "../src/mcp/tool-output-schemas.js";
import { Project } from "../src/schema/app-schema.js";
import { createArgs, PROJECT, registry, rpcClient, SCHEMA, UID } from "./mcp-create-table-fixture.js";
import {
    AclStore,
    projectState,
    readAsClient,
    restartFromStorage,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";

// Issue #5412 AS-001 / AS-009 (discovery): create_table through the unmodified
// production MCP endpoint of startServer(), with production SQLite persistence
// and the real resource-side ACL adapter, composes with the existing tools
// after an abrupt restart and in a fresh normal client reader.
describe("MCP create_table persists and composes with existing tools (#5412 AS-001)", function() {
    this.timeout(90000);
    const dirs: string[] = [];
    const servers: TestServer[] = [];
    let acl: AclStore;

    beforeEach(() => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
    });

    afterEach(async () => {
        for (const s of servers.splice(0)) await stopTestServer(s);
        for (const d of dirs.splice(0)) await fs.remove(d);
    });

    const start = async (dir: string) => {
        const server = await startTestServer(dir, acl);
        servers.push(server);
        return { server, mcp: rpcClient(server.server) };
    };

    it("advertises the exact create_table contract in tools/list", async () => {
        const dir = tempDir();
        dirs.push(dir);
        const { mcp } = await start(dir);
        const listed = (await mcp.rpc("tools/list", {})).tools.find((tool: { name: string; }) =>
            tool.name === "create_table"
        );
        expect(listed.inputSchema.type).to.equal("object");
        expect(Object.keys(listed.inputSchema.properties).sort()).to.deep.equal(
            ["dryRun", "name", "operationId", "projectId", "schemaSql"],
        );
        expect([...listed.inputSchema.required].sort()).to.deep.equal([
            "name",
            "operationId",
            "projectId",
            "schemaSql",
        ]);
        expect(listed.inputSchema.additionalProperties).to.equal(false);
        expect(listed.inputSchema.properties.operationId).to.include({ minLength: 1, maxLength: 200 });
        expect(Object.keys(listed.outputSchema.properties).sort()).to.deep.equal(
            ["applied", "displayName", "replayed", "revision", "schemaSql", "sqlName", "tableId"],
        );
        expect(listed.annotations).to.deep.include({
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
        });
        expect(listed._meta.securitySchemes).to.deep.equal([
            { type: "oauth2", scopes: ["outliner.read", "outliner.write"] },
        ]);
        for (const guidance of ["same operationId", "new operationId", "five minutes", "restart"]) {
            expect(listed.description).to.contain(guidance);
        }
    });

    it("creates through MCP, survives restart, and supports write_relation and create_grid", async () => {
        const dir = tempDir();
        dirs.push(dir);
        const first = await start(dir);
        await seedProject(first.server.hocuspocus, PROJECT);
        const before = await withRoom(first.server.hocuspocus, `projects/${PROJECT}`, projectState);
        expect(Object.values(before.tables).map(table => table.sqlName)).not.to.include("mcp_tasks");

        const args = createArgs({ operationId: "table-create-1" });
        const { result, payload } = await first.mcp.call("create_table", args);
        expect(result.isError).to.equal(undefined);
        expect(result.structuredContent).to.deep.equal(payload);
        expect(toolOutputSchemas.create_table.safeParse(payload).success).to.equal(true);
        expect(payload).to.deep.include({
            applied: true,
            replayed: false,
            displayName: "MCP Tasks",
            sqlName: "mcp_tasks",
            schemaSql: SCHEMA,
        });
        const { tableId, revision } = payload;

        // Creation added one registry entry and nothing else (no Grid, placement, page change).
        const after = await withRoom(first.server.hocuspocus, `projects/${PROJECT}`, projectState);
        expect(after.other).to.deep.equal(before.other);
        expect(Object.keys(after.tables).sort()).to.deep.equal([...Object.keys(before.tables), tableId].sort());

        const readBack = async (mcp: ReturnType<typeof rpcClient>) => {
            const table = (await mcp.call("get_table", { projectId: PROJECT, tableId })).payload;
            expect(table).to.include({
                tableId,
                displayName: "MCP Tasks",
                sqlName: "mcp_tasks",
                rawSchemaSql: SCHEMA,
                recordCount: 0,
                revision,
            });
            const relations = (await mcp.call("list_relations", { projectId: PROJECT })).payload.relations;
            expect(relations.filter((relation: { relation: string; }) => relation.relation === "mcp_tasks"))
                .to.deep.equal([{ relation: "mcp_tasks", kind: "table", tableId, displayName: "MCP Tasks" }]);
            const rows =
                (await mcp.call("query_sql", { projectId: PROJECT, sql: "SELECT id, title, done FROM mcp_tasks" }))
                    .payload;
            expect(rows.rowCount).to.equal(0);
            expect(rows.columns.map((column: { name: string; }) => column.name)).to.deep.equal(["id", "title", "done"]);
        };
        await readBack(first.mcp);

        // Abrupt restart from exactly what storage acknowledged.
        const restarted = await restartFromStorage(dir, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        await readBack(rpcClient(restarted.server.server));
        await stopTestServer(servers.pop());

        // A fresh normal client resolves registry entry -> subdocument -> Table room.
        const client = await readAsClient(restarted.dir, PROJECT, tableId);
        expect(client).to.include({ name: "MCP Tasks", sqlName: "mcp_tasks", schema: SCHEMA, recordCount: 0 });
        expect(client.subdoc?.guid).to.equal(`${PROJECT}--table--${tableId}`);

        const again = await start(restarted.dir);
        const pageId = await withRoom(again.server.hocuspocus, `projects/${PROJECT}`, doc => {
            const items = Project.fromDoc(doc).items;
            return [...items].find(page => page.text === "Plans")!.id;
        });
        const inserted = await again.mcp.call("write_relation", {
            projectId: PROJECT,
            relation: "mcp_tasks",
            write: { op: "INSERT", values: { id: "task-1", title: "Ship create_table", done: false } },
        });
        expect(inserted.payload).to.include({ applied: true, relation: "mcp_tasks" });
        const grid = await again.mcp.call("create_grid", {
            projectId: PROJECT,
            tableId,
            pageId,
            query: "SELECT id AS id, title AS title, done AS done FROM mcp_tasks",
            operationId: "grid-over-mcp-tasks",
        });
        expect(grid.payload).to.include({ applied: true, sourceTableId: tableId, pageId });
        const trace = (await again.mcp.call("trace_grid", { projectId: PROJECT, gridId: grid.payload.gridId }))
            .payload;
        expect(JSON.stringify(trace)).to.contain("Ship create_table");
        const tables = await withRoom(again.server.hocuspocus, `projects/${PROJECT}`, registry);
        expect(Object.values(tables).filter(table => table.sqlName === "mcp_tasks")).to.have.length(1);
        expect(tables[tableId]).to.deep.equal({ name: "MCP Tasks", sqlName: "mcp_tasks" });
        const grids = await withRoom(
            again.server.hocuspocus,
            `projects/${PROJECT}`,
            doc => (doc.getMap<Y.Map<unknown>>("yjsGrids").get(grid.payload.gridId))?.get("sourceTableId"),
        );
        expect(grids).to.equal(tableId);
        const finalTable = (await again.mcp.call("get_table", { projectId: PROJECT, tableId })).payload;
        expect(finalTable).to.include({ rawSchemaSql: SCHEMA, recordCount: 1 });
    });
});
