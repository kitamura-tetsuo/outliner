import { expect } from "chai";
import { createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";

describe("MCP typed Table catalog publication boundary (#5534 REQ-004)", function() {
    this.timeout(60000);

    for (
        const replacement of [
            "CREATE TYPE creation_state AS ENUM ('b', 'a')",
            "CREATE TYPE renamed_creation_state AS ENUM ('a', 'b')",
        ]
    ) {
        it(`refuses stale creation after catalog replacement: ${replacement}`, async () => {
            const fixture = await startMcpTestServer();
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
                            object: {
                                id: "creation-enum",
                                kind: "enum",
                                source: "CREATE TYPE creation_state AS ENUM ('a', 'b')",
                            },
                        },
                    })).status,
                ).to.equal("applied");
                let resume!: () => void;
                let paused!: () => void;
                const reached = new Promise<void>(resolve => paused = resolve);
                const barrier = new Promise<void>(resolve => resume = resolve);
                fixture.seams.beforePublication = async () => {
                    paused();
                    await barrier;
                };
                const creating = fixture.mcp.call("create_table", {
                    projectId: PROJECT,
                    name: "Stale typed Table",
                    schemaSql: "CREATE TABLE stale_creation (id TEXT PRIMARY KEY, state creation_state)",
                    operationId: `stale-create-${replacement.includes("renamed") ? "rename" : "order"}`,
                });
                await reached;
                const current = await catalog.read(UID, PROJECT);
                expect(
                    (await catalog.apply(UID, PROJECT, {
                        expectedRevision: current.revision,
                        intent: {
                            operation: "replace",
                            object: { id: "creation-enum", kind: "enum", source: replacement },
                        },
                    })).status,
                ).to.equal("applied");
                resume();
                expect((await creating).payload.code).to.equal("stale_revision");
                expect((await fixture.mcp.call("list_relations", { projectId: PROJECT })).payload.relations)
                    .not.to.deep.include({ relation: "stale_creation", kind: "table" });
            } finally {
                await fixture.stop();
            }
        });
    }
});
