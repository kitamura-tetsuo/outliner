import { expect } from "chai";
import fs from "fs-extra";
import {
    AclStore,
    projectState,
    readAsClient,
    restartFromStorage,
    seedProject,
    startTestServer,
    stopTestServer,
    storedRooms,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";

const UID = "user-1";
const SCHEMA = "CREATE TABLE mcp_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN)";

// Issue #5411 AS-001 / AS-005: a standalone Table created through the real
// server boundary is usable by independent production readers, without a Grid
// or any browser seeding, and survives an abrupt restart from storage.
describe("standalone server-side Table creation (#5411 AS-001, AS-005)", function() {
    this.timeout(60000);
    const dirs: string[] = [];
    const servers: TestServer[] = [];
    let acl: AclStore;
    let server: TestServer;
    let dir: string;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", "proj-a", UID);
        dir = tempDir();
        dirs.push(dir);
        server = await startTestServer(dir, acl);
        servers.push(server);
        await seedProject(server.hocuspocus, "proj-a");
    });

    afterEach(async () => {
        for (const s of servers.splice(0)) await stopTestServer(s);
        for (const d of dirs.splice(0)) await fs.remove(d);
    });

    it("registers one fresh Table whose own room holds the exact schema and no records", async () => {
        const before = await withRoom(server.hocuspocus, "projects/proj-a", projectState);
        const created = await server.tableCreation.createTable(UID, "proj-a", { name: "MCP Tasks", schemaSql: SCHEMA });
        expect(created).to.include({
            status: "created",
            applied: true,
            displayName: "MCP Tasks",
            sqlName: "mcp_tasks",
            schemaSql: SCHEMA,
        });
        if (created.status !== "created") throw new Error("not created");
        const after = await withRoom(server.hocuspocus, "projects/proj-a", projectState);
        // Only one registry entry was added; Grids, Pages, placements, and schedules are untouched.
        expect(after.other).to.deep.equal(before.other);
        expect(after.tables).to.deep.equal({
            ...before.tables,
            [created.tableId]: {
                name: "MCP Tasks",
                sqlName: "mcp_tasks",
                docGuid: `proj-a--table--${created.tableId}`,
            },
        });
        const room = await withRoom(
            server.hocuspocus,
            `projects/proj-a/tables/${created.tableId}`,
            doc => ({ schema: doc.getText("schema").toString(), records: doc.getMap("data").size }),
        );
        expect(room).to.deep.equal({ schema: SCHEMA, records: 0 });

        // Independent production readers resolve the returned identity.
        const table = await server.mcpRelations.getTable(UID, "proj-a", created.tableId);
        expect(table).to.include({
            tableId: created.tableId,
            displayName: "MCP Tasks",
            sqlName: "mcp_tasks",
            rawSchemaSql: SCHEMA,
            recordCount: 0,
            revision: created.revision,
        });
        const relations = await server.mcpRelations.listRelations(UID, "proj-a");
        expect(relations.relations).to.deep.include({
            relation: "mcp_tasks",
            kind: "table",
            tableId: created.tableId,
            displayName: "MCP Tasks",
        });
        const rows = await server.mcpRelations.querySql(UID, "proj-a", "SELECT id, title, done FROM mcp_tasks");
        expect(rows.rowCount).to.equal(0);
        expect(rows.columns.map(column => column.name)).to.deep.equal(["id", "title", "done"]);
    });

    it("preserves an explicitly empty display name", async () => {
        const created = await server.tableCreation.createTable(UID, "proj-a", {
            name: "",
            schemaSql: "CREATE TABLE unnamed (id TEXT)",
        });
        if (created.status !== "created") throw new Error("not created");
        expect(created.displayName).to.equal("");
        const table = await server.mcpRelations.getTable(UID, "proj-a", created.tableId);
        expect(table.displayName).to.equal("");
    });

    it("survives an abrupt restart and loads in an independent client via the registry subdocument", async () => {
        const created = await server.tableCreation.createTable(UID, "proj-a", { name: "MCP Tasks", schemaSql: SCHEMA });
        if (created.status !== "created") throw new Error("not created");
        // Copy storage right after the acknowledgement; the original server keeps
        // its in-memory rooms and is never gracefully flushed into the copy.
        const restarted = await restartFromStorage(dir, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);
        expect(storedRooms(restarted.dir)).to.include(`projects/proj-a/tables/${created.tableId}`);

        const table = await restarted.server.mcpRelations.getTable(UID, "proj-a", created.tableId);
        expect(table).to.include({
            displayName: "MCP Tasks",
            sqlName: "mcp_tasks",
            rawSchemaSql: SCHEMA,
            recordCount: 0,
            revision: created.revision,
        });
        const rows = await restarted.server.mcpRelations.querySql(
            UID,
            "proj-a",
            "SELECT id, title, done FROM mcp_tasks",
        );
        expect(rows.rowCount).to.equal(0);
        await stopTestServer(servers.pop());

        const client = await readAsClient(restarted.dir, "proj-a", created.tableId);
        expect(client).to.include({ name: "MCP Tasks", sqlName: "mcp_tasks", schema: SCHEMA, recordCount: 0 });
        expect(client.subdoc?.guid).to.equal(`proj-a--table--${created.tableId}`);
    });
});
