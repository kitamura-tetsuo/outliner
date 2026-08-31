import { expect } from "chai";
import express from "express";
import fs from "fs";
import request from "supertest";
import * as Y from "yjs";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../src/mcp/relation-service.js";
import { Project } from "../src/schema/app-schema.js";
import { mcpLogger, mcpLogPath } from "../src/utils/log-manager.js";

/**
 * Issue #5208 ("Add MCP write scope, mutation safety contract, and audit
 * logging"): every write tool shares one revision/idempotency/error/audit
 * contract. These tests drive that contract through the real HTTP+MCP
 * router (not just the service layer already covered by
 * mcp-relation-service.test.ts) so the client-visible shape of a
 * conflict, a scope rejection, and a dry run are all pinned down too.
 */
function fixture() {
    const project = Project.createInstance("Mutations");
    const tableId = "table-1";
    const entry = new Y.Map<unknown>();
    entry.set("name", "Tasks");
    entry.set("sqlName", "tasks");
    project.ydoc.getMap("yjsTables").set(tableId, entry);

    const table = new Y.Doc();
    table.getText("schema").insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN)");
    const first = new Y.Map<string | boolean | null>();
    first.set("id", "r1");
    first.set("title", "First");
    first.set("done", false);
    table.getMap("data").set("r1", first);

    const page = project.addPage("Roadmap", "test");
    const textItem = page.items.addNode("test");
    textItem.text = "Ship it";

    const gridMap = new Y.Map<unknown>();
    gridMap.set("name", "Roadmap grid");
    gridMap.set("query", "SELECT * FROM tasks");
    project.ydoc.getMap("yjsGrids").set("grid-1", gridMap);

    const rooms = new Map<string, Y.Doc>([
        ["projects/project-1", project.ydoc],
        ["projects/project-1/tables/table-1", table],
    ]);
    const hocuspocus = {
        openDirectConnection: async (room: string) => ({ document: rooms.get(room), disconnect: async () => {} }),
    } as never;
    const canAccess = async () => true;
    const accessibleProjects = async () => [{ projectId: "project-1", title: "Mutations" }];
    const readService = new OutlinerReadService(hocuspocus, canAccess, accessibleProjects);
    const relationService = new OutlinerRelationService(hocuspocus, canAccess);
    return { readService, relationService, table, textItem };
}

function buildApp(readService: OutlinerReadService, relationService: OutlinerRelationService, scope: string) {
    const app = express();
    app.use(express.json());
    app.use(
        createMcpRouter(readService, () => ({ uid: "uid-1", scope }), "http://localhost:7093", relationService),
    );
    return app;
}

const rpc = (method: string, params?: Record<string, unknown>, id = 1) => ({
    jsonrpc: "2.0",
    id,
    method,
    ...(params ? { params } : {}),
});
const bodyOf = (response: request.Response) => {
    if (response.body?.jsonrpc) return response.body;
    const data = response.text.split("\n").find(line => line.startsWith("data: "));
    return JSON.parse(data?.slice(6) ?? "{}");
};
const call = (app: express.Express, name: string, args: Record<string, unknown>) =>
    request(app).post("/mcp")
        .set("Authorization", "Bearer token")
        .set("Accept", "application/json, text/event-stream")
        .send(rpc("tools/call", { name, arguments: args }));
const payloadOf = (response: request.Response) => JSON.parse(bodyOf(response).result.content[0].text);

describe("MCP mutation safety contract", () => {
    it("advertises accurate per-tool annotations for the write tools", async () => {
        const { readService, relationService } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");
        const listed = await request(app).post("/mcp")
            .set("Authorization", "Bearer token")
            .set("Accept", "application/json, text/event-stream")
            .send(rpc("tools/list"));
        const tools = bodyOf(listed).result.tools as {
            name: string;
            annotations: Record<string, boolean>;
            _meta?: Record<string, unknown>;
        }[];
        const readOnlyScheme = { outlinerOAuth: { type: "oauth2", scopes: ["outliner.read"] } };
        const readWriteScheme = { outlinerOAuth: { type: "oauth2", scopes: ["outliner.read", "outliner.write"] } };
        expect(tools.find(t => t.name === "get_table")?.annotations).to.include({
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        });
        expect(tools.find(t => t.name === "trace_grid")?.annotations).to.include({
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        });
        for (const name of ["validate_table_schema", "validate_grid_query"]) {
            expect(tools.find(t => t.name === name)?.annotations).to.include({
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
            });
        }
        expect(tools.find(t => t.name === "write_relation")?.annotations).to.include({
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
        });
        for (const name of ["set_view_query", "update_grid_query"]) {
            expect(tools.find(t => t.name === name)?.annotations).to.include({
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
            });
        }
        for (const name of ["update_table_schema", "update_table_records"]) {
            expect(tools.find(t => t.name === name)?.annotations).to.include({
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
            });
        }

        // Issue #5257: every read-only tool declares an `outliner.read`
        // OAuth security requirement, and every mutation tool declares both
        // `outliner.read` and `outliner.write`, so an MCP/ChatGPT client can
        // discover the write grant it needs before ever calling the tool.
        for (
            const name of [
                "get_table",
                "trace_grid",
                "validate_table_schema",
                "validate_grid_query",
                "list_relations",
                "get_relation_schema",
                "query_sql",
            ]
        ) {
            expect(tools.find(t => t.name === name)?._meta?.["mcp/securitySchemes"]).to.deep.equal(readOnlyScheme);
        }
        for (
            const name of [
                "write_relation",
                "update_grid_query",
                "set_view_query",
                "update_table_schema",
                "update_table_records",
            ]
        ) {
            expect(tools.find(t => t.name === name)?._meta?.["mcp/securitySchemes"]).to.deep.equal(readWriteScheme);
        }
    });

    it(
        "rejects a write tool call from a read-only-scoped token with a structured forbidden error "
            + "and an OAuth insufficient_scope challenge",
        async () => {
            const { readService, relationService, table } = fixture();
            const app = buildApp(readService, relationService, "outliner.read");
            const res = await call(app, "write_relation", {
                projectId: "project-1",
                relation: "tasks",
                write: { op: "UPDATE", rowId: "r1", column: "done", value: true },
            });
            expect(res.status).to.equal(200);
            expect(bodyOf(res).result.isError).to.equal(true);
            const payload = payloadOf(res);
            expect(payload.code).to.equal("forbidden");
            expect(payload.error).to.match(/outliner\.write scope/);

            // AC-002: the rejection also carries a standards-shaped
            // insufficient_scope challenge in `_meta`, and the underlying data
            // is left untouched.
            const challenge = bodyOf(res).result._meta?.["mcp/www_authenticate"] as string;
            expect(challenge).to.be.a("string");
            expect(challenge).to.match(/^Bearer /);
            expect(challenge).to.include('error="insufficient_scope"');
            expect(challenge).to.include('scope="outliner.write"');
            expect(challenge).to.include(
                'resource_metadata="http://localhost:7093/.well-known/oauth-protected-resource/mcp"',
            );
            expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("done")).to.equal(false);
        },
    );

    it("returns a revision on write and rejects a stale expectedRevision with a structured conflict", async () => {
        const { readService, relationService } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");

        const first = await call(app, "write_relation", {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "UPDATE", rowId: "r1", column: "title", value: "Second" },
        });
        const firstPayload = payloadOf(first);
        expect(firstPayload.applied).to.equal(true);
        expect(firstPayload.revision).to.be.a("string");
        expect(firstPayload.priorRevision).to.not.equal(firstPayload.revision);

        const stale = await call(app, "write_relation", {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "UPDATE", rowId: "r1", column: "title", value: "Third" },
            expectedRevision: firstPayload.priorRevision,
        });
        expect(bodyOf(stale).result.isError).to.equal(true);
        const stalePayload = payloadOf(stale);
        expect(stalePayload.code).to.equal("stale_revision");
        expect(stalePayload.currentRevision).to.equal(firstPayload.revision);

        const matching = await call(app, "write_relation", {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "UPDATE", rowId: "r1", column: "title", value: "Third" },
            expectedRevision: firstPayload.revision,
        });
        expect(payloadOf(matching).applied).to.equal(true);
    });

    it("dry-runs a write without persisting it", async () => {
        const { readService, relationService, table } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");
        const res = await call(app, "write_relation", {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "UPDATE", rowId: "r1", column: "title", value: "Should not persist" },
            dryRun: true,
        });
        const payload = payloadOf(res);
        expect(payload.applied).to.equal(false);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("title")).to.equal("First");
    });

    it("replays a write with the same operationId instead of duplicating it", async () => {
        const { readService, relationService, table } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");
        const args = {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "INSERT", values: { id: "r9", title: "Once", done: false } },
            operationId: "retry-1",
        };
        const first = await call(app, "write_relation", args);
        const second = await call(app, "write_relation", args);
        const firstPayload = payloadOf(first);
        const secondPayload = payloadOf(second);
        expect(firstPayload.replayed).to.equal(false);
        expect(secondPayload.replayed).to.equal(true);
        expect({ ...secondPayload, replayed: undefined }).to.deep.equal({ ...firstPayload, replayed: undefined });
        expect(table.getMap("data").has("r9")).to.equal(true);
        expect(secondPayload.applied).to.equal(true);
    });

    it("does not duplicate a mutation when two concurrent calls share an operationId", async () => {
        const { readService, relationService, table } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");
        const args = {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "INSERT", values: { id: "r10", title: "Concurrent", done: false } },
            operationId: "concurrent-1",
        };
        const [first, second] = await Promise.all([
            call(app, "write_relation", args),
            call(app, "write_relation", args),
        ]);
        const payloads = [payloadOf(first), payloadOf(second)];
        expect(payloads.filter(p => p.replayed === true)).to.have.lengthOf(1);
        expect(payloads.filter(p => p.replayed === false)).to.have.lengthOf(1);
        expect(table.getMap("data").has("r10")).to.equal(true);
    });

    it("rejects an oversized write payload with a structured size_limit error", async () => {
        const { readService, relationService } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");
        const res = await call(app, "write_relation", {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "UPDATE", rowId: "r1", column: "title", value: "x".repeat(40 * 1024) },
        });
        expect(bodyOf(res).result.isError).to.equal(true);
        expect(payloadOf(res).code).to.equal("size_limit");
    });

    it("audits a mutation attempt without leaking the uid or the written value", async () => {
        if (fs.existsSync(mcpLogPath)) fs.truncateSync(mcpLogPath, 0);
        const { readService, relationService } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");
        await call(app, "write_relation", {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "UPDATE", rowId: "r1", column: "title", value: "audited-secret-value" },
            operationId: "audit-op-1",
        });

        if (mcpLogger && typeof mcpLogger.flush === "function") mcpLogger.flush();
        let auditLine: Record<string, unknown> | undefined;
        for (let i = 0; i < 50 && !auditLine; i++) {
            if (fs.existsSync(mcpLogPath)) {
                const lines = fs.readFileSync(mcpLogPath, "utf-8").split("\n").filter(Boolean);
                auditLine = lines.map(line => JSON.parse(line)).find(entry => entry.event === "mcp_audit");
            }
            if (!auditLine) await new Promise(r => setTimeout(r, 100));
        }

        expect(auditLine, "expected an mcp_audit log line").to.not.be.undefined;
        expect(auditLine!.tool).to.equal("write_relation");
        expect(auditLine!.projectId).to.equal("project-1");
        expect(auditLine!.entity).to.equal("tasks");
        expect(auditLine!.operationId).to.equal("audit-op-1");
        expect(auditLine!.dryRun).to.equal(false);
        expect(auditLine!.outcome).to.equal("success");
        expect(auditLine!.applied).to.equal(true);
        expect(auditLine!.newRevision).to.be.a("string");
        expect(auditLine!.uidFingerprint).to.be.a("string").with.lengthOf(12);

        const serialized = JSON.stringify(auditLine);
        expect(serialized).to.not.include("uid-1");
        expect(serialized).to.not.include("audited-secret-value");
    });

    it("marks an operationId replay as replayed:true in the audit log, distinct from the original apply", async () => {
        if (fs.existsSync(mcpLogPath)) fs.truncateSync(mcpLogPath, 0);
        const { readService, relationService } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");
        const args = {
            projectId: "project-1",
            relation: "tasks",
            write: { op: "UPDATE", rowId: "r1", column: "title", value: "Replayed" },
            operationId: "audit-replay-1",
        };
        await call(app, "write_relation", args);
        await call(app, "write_relation", args);

        if (mcpLogger && typeof mcpLogger.flush === "function") mcpLogger.flush();
        let auditLines: Record<string, unknown>[] = [];
        for (let i = 0; i < 50 && auditLines.length < 2; i++) {
            if (fs.existsSync(mcpLogPath)) {
                const lines = fs.readFileSync(mcpLogPath, "utf-8").split("\n").filter(Boolean);
                auditLines = lines.map(line => JSON.parse(line)).filter(entry => entry.event === "mcp_audit");
            }
            if (auditLines.length < 2) await new Promise(r => setTimeout(r, 100));
        }

        expect(auditLines).to.have.lengthOf(2);
        expect(auditLines[0]!.replayed).to.equal(false);
        expect(auditLines[1]!.replayed).to.equal(true);
    });

    it("closes the read-modify-write loop for outline_items: get_item's revision works as write_relation's expectedRevision", async () => {
        const { readService, relationService, textItem } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");

        const read = await call(app, "get_item", { projectId: "project-1", itemId: textItem.id });
        const readPayload = payloadOf(read);
        expect(readPayload.revision).to.be.a("string");

        const matching = await call(app, "write_relation", {
            projectId: "project-1",
            relation: "outline_items",
            write: { op: "UPDATE", rowId: textItem.key, column: "text", value: "Ship it now" },
            expectedRevision: readPayload.revision,
        });
        expect(payloadOf(matching).applied).to.equal(true);

        const stale = await call(app, "write_relation", {
            projectId: "project-1",
            relation: "outline_items",
            write: { op: "UPDATE", rowId: textItem.key, column: "text", value: "Ship it again" },
            expectedRevision: readPayload.revision,
        });
        expect(bodyOf(stale).result.isError).to.equal(true);
        expect(payloadOf(stale).code).to.equal("stale_revision");
    });

    it("closes the read-modify-write loop for a Grid view: get_grid's revision works as set_view_query's expectedRevision", async () => {
        const { readService, relationService } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");

        const read = await call(app, "get_grid", { projectId: "project-1", gridId: "grid-1" });
        const readPayload = payloadOf(read);
        expect(readPayload.revision).to.be.a("string");

        const matching = await call(app, "set_view_query", {
            projectId: "project-1",
            kind: "grid",
            viewId: "grid-1",
            query: "SELECT id FROM tasks",
            expectedRevision: readPayload.revision,
        });
        expect(payloadOf(matching).applied).to.equal(true);
    });

    it("validates a dry-run outline_items UPDATE against writable columns before reporting success", async () => {
        const { readService, relationService, textItem } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");

        const res = await call(app, "write_relation", {
            projectId: "project-1",
            relation: "outline_items",
            write: { op: "UPDATE", rowId: textItem.key, column: "bogus", value: "x" },
            dryRun: true,
        });
        expect(bodyOf(res).result.isError).to.equal(true);
        expect(payloadOf(res).code).to.equal("validation_failed");
    });

    it("rejects update_table_schema and update_table_records from a read-only-scoped token", async () => {
        const { readService, relationService } = fixture();
        const app = buildApp(readService, relationService, "outliner.read");
        for (
            const call_ of [
                () =>
                    call(app, "update_table_schema", {
                        projectId: "project-1",
                        tableId: "table-1",
                        schemaSql: "CREATE TABLE tasks (id TEXT PRIMARY KEY)",
                        expectedRevision: "any",
                    }),
                () =>
                    call(app, "update_table_records", {
                        projectId: "project-1",
                        tableId: "table-1",
                        expectedRevision: "any",
                        changes: [{ recordId: "r1", values: { title: "x" } }],
                    }),
            ]
        ) {
            const res = await call_();
            expect(bodyOf(res).result.isError).to.equal(true);
            expect(payloadOf(res).code).to.equal("forbidden");
        }
    });

    it("audits update_table_schema and update_table_records under a table:<id> entity", async () => {
        if (fs.existsSync(mcpLogPath)) fs.truncateSync(mcpLogPath, 0);
        const { readService, relationService, table } = fixture();
        const app = buildApp(readService, relationService, "outliner.read outliner.write");

        const before = payloadOf(await call(app, "get_table", { projectId: "project-1", tableId: "table-1" }));
        const schemaRes = await call(app, "update_table_schema", {
            projectId: "project-1",
            tableId: "table-1",
            schemaSql: 'CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN, "order" INTEGER)',
            expectedRevision: before.revision,
            operationId: "table-schema-op-1",
        });
        const schemaPayload = payloadOf(schemaRes);
        expect(schemaPayload.applied).to.equal(true);
        expect(table.getText("schema").toString()).to.include('"order" INTEGER');

        const recordsRes = await call(app, "update_table_records", {
            projectId: "project-1",
            tableId: "table-1",
            expectedRevision: schemaPayload.revision,
            changes: [{ recordId: "r1", values: { title: "Updated" } }],
            operationId: "table-records-op-1",
        });
        const recordsPayload = payloadOf(recordsRes);
        expect(recordsPayload.applied).to.equal(true);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("title")).to.equal("Updated");

        mcpLogger.flush?.();
        let audits: Record<string, unknown>[] = [];
        for (let i = 0; i < 50 && audits.length < 2; i++) {
            if (fs.existsSync(mcpLogPath)) {
                const lines = fs.readFileSync(mcpLogPath, "utf-8").split("\n").filter(Boolean);
                audits = lines.map(line => JSON.parse(line)).filter(entry => entry.event === "mcp_audit");
            }
            if (audits.length < 2) await new Promise(r => setTimeout(r, 100));
        }
        expect(audits).to.have.lengthOf(2);
        expect(audits[0]).to.include({
            tool: "update_table_schema",
            entity: "table:table-1",
            operationId: "table-schema-op-1",
            applied: true,
        });
        expect(audits[1]).to.include({
            tool: "update_table_records",
            entity: "table:table-1",
            operationId: "table-records-op-1",
            applied: true,
        });
    });
});
