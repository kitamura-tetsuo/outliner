import { expect } from "chai";
import { createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";

describe("MCP ENUM stale dispatch (#5534 REQ-008)", function() {
    this.timeout(60000);

    it("refuses a dispatched record mutation paused across a production catalog change", async () => {
        const fixture = await startMcpTestServer();
        try {
            const catalog = new SqlCatalogMutationService(
                fixture.server.hocuspocus,
                fixture.acl.checkAccess,
                createDocumentStore(fixture.server.persistence!),
            );
            const before = await catalog.read(UID, PROJECT);
            const createdCatalog = await catalog.apply(UID, PROJECT, {
                expectedRevision: before.revision,
                intent: {
                    operation: "create",
                    object: { id: "stale-enum", kind: "enum", source: "CREATE TYPE stale_state AS ENUM ('a', 'b')" },
                },
            });
            if (createdCatalog.status !== "applied") throw new Error("catalog setup failed");
            const created = await fixture.mcp.call("create_table", {
                projectId: PROJECT,
                name: "Stale rows",
                schemaSql: "CREATE TABLE stale_rows (id TEXT PRIMARY KEY, state stale_state)",
                operationId: "stale-create",
            });
            const tableId = created.payload.tableId;
            await fixture.mcp.call("write_relation", {
                projectId: PROJECT,
                relation: "stale_rows",
                write: { op: "INSERT", values: { id: "stable-id", state: "a" } },
            });
            const table = await fixture.mcp.call("get_table", { projectId: PROJECT, tableId });

            let resume!: () => void;
            let paused!: () => void;
            const reached = new Promise<void>(resolve => paused = resolve);
            const barrier = new Promise<void>(resolve => resume = resolve);
            fixture.seams.beforeRecordBatchPublication = async () => {
                paused();
                await barrier;
            };
            const updating = fixture.mcp.call("update_table_records", {
                projectId: PROJECT,
                tableId,
                expectedRevision: table.payload.revision,
                changes: [{ recordId: "stable-id", values: { state: "b" } }],
            });
            await reached;
            const current = await catalog.read(UID, PROJECT);
            expect(
                (await catalog.apply(UID, PROJECT, {
                    expectedRevision: current.revision,
                    intent: {
                        operation: "replace",
                        object: {
                            id: "stale-enum",
                            kind: "enum",
                            source: "CREATE TYPE stale_state AS ENUM ('b', 'a')",
                        },
                    },
                })).status,
            ).to.equal("applied");
            resume();
            const refused = await updating;
            expect(refused.payload.code).to.equal("stale_revision");
            const after = await fixture.mcp.call("get_table", { projectId: PROJECT, tableId, includeRecords: true });
            expect(after.payload.records[0].values.state).to.equal("a");
        } finally {
            await fixture.stop();
        }
    });
});
