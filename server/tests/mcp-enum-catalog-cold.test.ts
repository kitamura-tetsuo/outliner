import { expect } from "chai";
import fs from "fs-extra";
import { createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import {
    PROJECT,
    rpcClient,
    startMcpTestServer,
    startTestServer,
    stopTestServer,
    UID,
} from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("MCP ENUM cold reconstruction (#5534 REQ-008)", function() {
    this.timeout(60000);

    it("reconstructs catalog types and records from persistence after a server restart", async () => {
        const fixture = await startMcpTestServer();
        let restarted: Awaited<ReturnType<typeof startTestServer>> | undefined;
        try {
            const catalog = new SqlCatalogMutationService(
                fixture.server.hocuspocus,
                fixture.acl.checkAccess,
                createDocumentStore(fixture.server.persistence!),
            );
            const before = await catalog.read(UID, PROJECT);
            expect(
                (await catalog.apply(UID, PROJECT, {
                    expectedRevision: before.revision,
                    intent: {
                        operation: "create",
                        object: { id: "cold-enum", kind: "enum", source: "CREATE TYPE cold_state AS ENUM ('z', 'a')" },
                    },
                })).status,
            ).to.equal("applied");
            const created = await fixture.production.call("create_table", {
                projectId: PROJECT,
                name: "Cold rows",
                schemaSql: "CREATE TABLE cold_rows (id TEXT PRIMARY KEY, state cold_state)",
                operationId: "cold-create",
            });
            await fixture.production.call("write_relation", {
                projectId: PROJECT,
                relation: "cold_rows",
                write: { op: "INSERT", values: { id: "cold-row", state: "a" } },
            });
            const tableId = created.payload.tableId;
            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}/tables/${tableId}`, () => {});

            await stopTestServer(fixture.server);
            restarted = await startTestServer(fixture.dir, fixture.acl);
            const cold = rpcClient(restarted.server);
            const schema = await cold.call("get_relation_schema", { projectId: PROJECT, relation: "cold_rows" });
            expect(schema.payload.columns.find((column: { name: string; }) => column.name === "state").enum.labels)
                .to.deep.equal(["z", "a"]);
            const records = await cold.call("get_table", { projectId: PROJECT, tableId, includeRecords: true });
            expect(records.payload.records).to.deep.include({
                recordId: "cold-row",
                values: { id: "cold-row", state: "a" },
                revision: records.payload.records[0].revision,
            });
            const ordered = await cold.call("query_sql", {
                projectId: PROJECT,
                sql: "SELECT state FROM cold_rows ORDER BY state",
            });
            expect(ordered.payload.rows).to.deep.equal([{ state: "a" }]);
        } finally {
            await stopTestServer(restarted);
            await fs.remove(fixture.dir);
        }
    });
});
