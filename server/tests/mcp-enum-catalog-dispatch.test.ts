import { expect } from "chai";
import * as Y from "yjs";
import { createDocumentStore } from "../src/persistence.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { seedProject, withRoom } from "./server-create-table-fixture.js";

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
            const tableId = created.payload.tableId as string;

            for (const [id, state] of [["first", "first"], ["empty", ""], ["nil", null], ["last", "second"]] as const) {
                const write = await fixture.production.call("write_relation", {
                    projectId: PROJECT,
                    relation: "dispatch_rows",
                    write: { op: "INSERT", values: { id, state } },
                });
                expect(write.payload.applied).to.equal(true);
            }

            const schema = await fixture.production.call("get_relation_schema", {
                projectId: PROJECT,
                relation: "dispatch_rows",
            });
            expect(schema.payload.columns.find((column: { name: string; }) => column.name === "state").enum)
                .to.deep.include({
                    objectId: "enum-dispatch-state",
                    labels: ["first", "", "second"],
                });

            const ordered = await fixture.production.call("query_sql", {
                projectId: PROJECT,
                sql: "SELECT state FROM dispatch_rows ORDER BY state NULLS LAST",
            });
            expect(ordered.payload.rows).to.deep.equal([
                { state: "first" },
                { state: "" },
                { state: "second" },
                { state: null },
            ]);
            expect(ordered.payload.columns[0].enum).to.deep.include({
                objectId: "enum-dispatch-state",
                sqlType: '"public"."dispatch_state"',
                labels: ["first", "", "second"],
            });
            const cast = await fixture.production.call("query_sql", {
                projectId: PROJECT,
                sql: "SELECT 'first'::TEXT::dispatch_state AS state",
            });
            expect(cast.payload.columns[0].enum).to.deep.include({
                objectId: "enum-dispatch-state",
                labels: ["first", "", "second"],
            });
            const records = await fixture.production.call("get_table", {
                projectId: PROJECT,
                tableId,
                includeRecords: true,
            });
            expect(records.payload.records.find((row: { recordId: string; }) => row.recordId === "empty").values.state)
                .to.equal("");
            expect(records.payload.records.find((row: { recordId: string; }) => row.recordId === "nil").values.state)
                .to.equal(null);
            expect(records.payload.schema.columns.find((column: { name: string; }) => column.name === "state").enum)
                .to.deep.include({ objectId: "enum-dispatch-state", labels: ["first", "", "second"] });

            const unsupported = await fixture.production.call("create_table", {
                projectId: PROJECT,
                name: "Unsupported enum array",
                schemaSql: "CREATE TABLE enum_arrays (id TEXT PRIMARY KEY, states dispatch_state[])",
                operationId: "enum-array-refusal",
            });
            expect(unsupported.payload.code).to.equal("validation_failed");
            expect((await fixture.production.call("list_relations", { projectId: PROJECT })).payload.relations)
                .not.to.deep.include({ relation: "enum_arrays", kind: "table" });
            const unsupportedMigration = await fixture.production.call("validate_table_schema", {
                projectId: PROJECT,
                tableId,
                schemaSql: "CREATE TABLE dispatch_rows (id TEXT PRIMARY KEY, states dispatch_state[])",
            });
            expect(unsupportedMigration.payload.code).to.equal("validation_failed");

            await withRoom(fixture.server.hocuspocus, `projects/${PROJECT}/tables/${tableId}`, doc => {
                doc.getMap<Y.Map<string>>("data").get("last")!.set("state", "invalid-synchronized-label");
            });
            const broken = await fixture.production.call("get_table", { projectId: PROJECT, tableId });
            const corrected = await fixture.production.call("update_table_records", {
                projectId: PROJECT,
                tableId,
                expectedRevision: broken.payload.revision,
                changes: [{ recordId: "last", values: { state: "second" } }],
            });
            expect(corrected.payload.applied).to.equal(true);
            const current = await fixture.production.call("get_table", { projectId: PROJECT, tableId });
            const refused = await fixture.production.call("update_table_records", {
                projectId: PROJECT,
                tableId,
                expectedRevision: current.payload.revision,
                changes: [{ recordId: "last", values: { state: "still-invalid" } }],
            });
            expect(refused.payload.code).to.equal("validation_failed");
            const catalogBeforeReorder = await catalog.read(UID, PROJECT);
            expect(
                (await catalog.apply(UID, PROJECT, {
                    expectedRevision: catalogBeforeReorder.revision,
                    intent: {
                        operation: "replace",
                        object: {
                            id: "enum-dispatch-state",
                            kind: "enum",
                            source: "CREATE TYPE dispatch_state AS ENUM ('second', '', 'first')",
                        },
                    },
                })).status,
            ).to.equal("applied");
            const staleEvidence = await fixture.production.call("update_table_records", {
                projectId: PROJECT,
                tableId,
                expectedRevision: current.payload.revision,
                changes: [{ recordId: "last", values: { state: "first" } }],
            });
            expect(staleEvidence.payload.code).to.equal("stale_revision");

            const projectB = "proj-b";
            fixture.acl.grant("projectUsers", projectB, UID);
            await seedProject(fixture.server.hocuspocus, projectB);
            const beforeB = await catalog.read(UID, projectB);
            expect(
                (await catalog.apply(UID, projectB, {
                    expectedRevision: beforeB.revision,
                    intent: {
                        operation: "create",
                        object: {
                            id: "enum-dispatch-state-b",
                            kind: "enum",
                            source: "CREATE TYPE dispatch_state AS ENUM ('second', 'first')",
                        },
                    },
                })).status,
            ).to.equal("applied");
            expect(
                (await fixture.production.call("create_table", {
                    projectId: projectB,
                    name: "Reverse typed table",
                    schemaSql: "CREATE TABLE reverse_rows (id TEXT PRIMARY KEY, state dispatch_state)",
                    operationId: "enum-dispatch-create-b",
                })).payload.applied,
            ).to.equal(true);
            for (const [id, state] of [["one", "first"], ["two", "second"]]) {
                expect(
                    (await fixture.production.call("write_relation", {
                        projectId: projectB,
                        relation: "reverse_rows",
                        write: { op: "INSERT", values: { id, state } },
                    })).payload.applied,
                ).to.equal(true);
            }
            const reversed = await fixture.production.call("query_sql", {
                projectId: projectB,
                sql: "SELECT state FROM reverse_rows ORDER BY state",
            });
            expect(reversed.payload.rows).to.deep.equal([{ state: "second" }, { state: "first" }]);
        } finally {
            await fixture.stop();
        }
    });
});
