import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { PROJECT, startMcpTestServer, token, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban reads through the production MCP HTTP router", function() {
    this.timeout(30_000);

    it("discovers strict bounds and returns a consumable same-observation query token", async () => {
        const f = await startMcpTestServer();
        const client = new Client({ name: "kanban-read-test", version: "1.0.0" });
        try {
            await seedBoard(f.server.hocuspocus);
            const address = f.server.server.address() as { port: number; };
            await client.connect(
                new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
                    requestInit: { headers: { Authorization: `Bearer ${token()}` } },
                }),
            );
            const discovered = await client.listTools();
            for (const name of ["list_kanbans", "get_kanban", "query_kanban"]) {
                const tool = discovered.tools.find((candidate: { name: string; }) => candidate.name === name);
                expect(tool, name).not.to.equal(undefined);
                expect(tool.annotations.readOnlyHint).to.equal(true);
                expect(tool._meta.securitySchemes[0].scopes).to.deep.equal(["outliner.read"]);
            }
            const limit = discovered.tools.find((tool: { name: string; }) => tool.name === "list_kanbans")
                .inputSchema.properties.limit;
            expect(limit).to.include({ minimum: 1, maximum: 500 });
            for (const invalid of [0, 501, 1.5]) {
                const response = await client.callTool({
                    name: "list_kanbans",
                    arguments: { projectId: PROJECT, limit: invalid },
                });
                expect(response.isError, JSON.stringify(response)).to.equal(true);
            }
            const call = async (name: string, args: Record<string, unknown>) => {
                const response = await client.callTool({ name, arguments: args });
                return { result: response, payload: JSON.parse((response.content as { text: string; }[])[0].text) };
            };
            const listed = await call("list_kanbans", { projectId: PROJECT });
            expect(listed.payload.kanbans).to.deep.equal([{ kanbanId: "board", name: "Board" }]);

            const queried = await call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(queried.result.isError, JSON.stringify(queried)).not.to.equal(true);
            expect(queried.payload.mutationObservation).to.deep.equal({ available: true });
            expect(queried.payload.observationToken).to.be.a("string");
            const card = queried.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards)[0];
            expect(card.sourceRef).to.deep.equal({ kind: "table", id: "tasks", sqlName: "tasks", rowId: "r1" });
            expect(card.fieldCapabilities).to.deep.include({ outputField: "title", updateEligible: true });
            expect(card.fieldCapabilities.find((field: { outputField: string; }) => field.outputField === "computed"))
                .to.include({ updateEligible: false, reason: "computed" });
            expect(card.moveCapability).to.deep.equal({ eligible: true });

            const guard = f.server.kanbanObservations.acquire(UID, PROJECT, queried.payload.observationToken);
            guard.assertCurrent({
                kind: "table-field",
                kanbanId: "board",
                scopeId: "tasks:r1:title",
                sourceRef: card.sourceRef,
                outputField: "title",
                physicalColumn: "title",
                role: "title",
            });
            guard.assertCurrent({
                kind: "table-field",
                kanbanId: "board",
                scopeId: "tasks:r1:status",
                sourceRef: card.sourceRef,
                outputField: "status",
                physicalColumn: "status",
                role: "group",
            });
            guard.release();
            await f.server.kanbanObservations.release(queried.payload.observationToken);
        } finally {
            await client.close();
            await f.stop();
        }
    });

    it("releases a captured metadata token when final authorization is revoked", async () => {
        const f = await startMcpTestServer();
        try {
            await seedBoard(f.server.hocuspocus);
            f.seams.gate = async (_requestId, check) => {
                if (check === 3) f.acl.revoke("projectUsers", PROJECT, UID);
            };
            const denied = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" }, {
                requestId: "revoked-metadata",
            });
            expect(denied.result.isError).to.equal(true);
            expect(denied.payload.code).to.equal("forbidden");
            // A leaked token would keep the otherwise unheld room alive.
            expect(f.server.hocuspocus.documents.has(`projects/${PROJECT}`)).to.equal(false);
        } finally {
            await f.stop();
        }
    });

    it("reports stale evidence when a retained source changes at final certification", async () => {
        const f = await startMcpTestServer();
        try {
            await seedBoard(f.server.hocuspocus);
            f.seams.gate = async (requestId, check) => {
                if (requestId !== "stale-query" || check !== 5) return;
                const source = f.server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`) as Y.Doc;
                source.getMap<Y.Map<unknown>>("data").get("r1")!.set("title", "Changed concurrently");
            };
            const stale = await f.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" }, {
                requestId: "stale-query",
            });
            expect(stale.result.isError, JSON.stringify(stale)).not.to.equal(true);
            expect(stale.payload.projection).to.deep.include({
                status: "unavailable",
                current: false,
                reason: "stale_evidence",
            });
            expect(stale.payload).not.to.have.property("observationToken");
            expect(stale.payload.mutationObservation.available).to.equal(false);
        } finally {
            await f.stop();
        }
    });
});

async function seedBoard(host: Parameters<typeof withRoom>[0]): Promise<void> {
    await withRoom(host, `projects/${PROJECT}`, doc => {
        const project = Project.fromDoc(doc);
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        doc.getMap("yjsTables").set("tasks", table);
        createKanbanEntry(doc, "board", {
            name: "Board",
            query: "SELECT id, status, title, title || '!' AS computed FROM tasks ORDER BY id",
            groupField: "status",
            titleField: "title",
            detailFields: ["computed"],
        });
        expect(project.items.length).to.be.greaterThan(0);
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        doc.getText("schema").insert(0, "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT)");
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        row.set("title", "First");
        doc.getMap("data").set("r1", row);
    });
}
