import { expect } from "chai";
import { createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";

describe("MCP ENUM catalog dispatch (#5534 REQ-008)", function() {
    this.timeout(60000);

    it("creates a typed Table from production catalog source and reads it through independent dispatch", async () => {
        const fixture = await startMcpTestServer();
        try {
            const catalog = new SqlCatalogMutationService(
                fixture.server.hocuspocus,
                fixture.acl.checkAccess,
                createDocumentStore(fixture.server.persistence!),
            );
            const before = await catalog.read(UID, PROJECT);
            const applied = await catalog.apply(UID, PROJECT, {
                expectedRevision: before.revision,
                intent: {
                    operation: "create",
                    object: {
                        id: "enum-dispatch-state",
                        kind: "enum",
                        source: "CREATE TYPE dispatch_state AS ENUM ('first', '', 'second')",
                    },
                },
            });
            expect(applied.status).to.equal("applied");

            const listed = await fixture.production.rpc("tools/list", {});
            expect(listed.tools.map((tool: { name: string; }) => tool.name)).to.include("create_table");
            const created = await fixture.production.call("create_table", {
                projectId: PROJECT,
                name: "Typed dispatch table",
                schemaSql: "CREATE TABLE dispatch_rows (id TEXT PRIMARY KEY, state dispatch_state)",
                operationId: "enum-dispatch-create",
            });
            expect(created.payload.applied).to.equal(true);

            const schema = await fixture.production.call("get_relation_schema", {
                projectId: PROJECT,
                relation: "dispatch_rows",
            });
            expect(schema.payload.columns.find((column: { name: string; }) => column.name === "state").enum)
                .to.deep.include({
                    objectId: "enum-dispatch-state",
                    labels: ["first", "", "second"],
                });
        } finally {
            await fixture.stop();
        }
    });
});
