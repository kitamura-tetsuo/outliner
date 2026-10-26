import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect } from "chai";
import * as Y from "yjs";
import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
} from "../../shared/src/services/kanbanDefinition.js";
import { Project } from "../src/schema/app-schema.js";
import { deferred, PROJECT, startMcpTestServer, token, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban reads through the production MCP HTTP router", function() {
    this.timeout(120_000);

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
                scopeId: tableScope("tasks", "r1", "title"),
                sourceRef: card.sourceRef,
                outputField: "title",
                physicalColumn: "title",
                role: "title",
            });
            guard.assertCurrent({
                kind: "table-field",
                kanbanId: "board",
                scopeId: tableScope("tasks", "r1", "status"),
                sourceRef: card.sourceRef,
                outputField: "status",
                physicalColumn: "status",
                role: "group",
            });
            guard.release();
            await f.server.kanbanObservations.release(queried.payload.observationToken);

            await seedDuplicateOccurrences(f.server.hocuspocus);
            const one = await call("query_kanban", { projectId: PROJECT, kanbanId: "board", maxCards: 1 });
            const two = await call("query_kanban", { projectId: PROJECT, kanbanId: "board", maxCards: 2 });
            for (const response of [one, two]) {
                expect(response.payload.mutationObservation).to.deep.equal({ available: true });
                const cards = response.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards);
                expect(cards).to.have.length(response === one ? 1 : 2);
                expect(
                    cards.every((item: { sourceRef: unknown; }) =>
                        JSON.stringify(item.sourceRef) === JSON.stringify(cards[0].sourceRef)
                    ),
                ).to.equal(true);
                expect(
                    cards.every((item: { fieldCapabilities: { outputField: string; updateEligible: boolean; }[]; }) =>
                        item.fieldCapabilities.some(field => field.outputField === "title" && field.updateEligible)
                    ),
                ).to.equal(true);
                expect(cards.every((item: { moveCapability: { eligible: boolean; }; }) => item.moveCapability.eligible))
                    .to.equal(true);
                expect(new Set(cards.map((item: { occurrenceId: string; }) => item.occurrenceId)).size)
                    .to.equal(cards.length);
                await f.server.kanbanObservations.release(response.payload.observationToken);
            }
            const three = await call("query_kanban", { projectId: PROJECT, kanbanId: "board", maxCards: 3 });
            const threeCards = three.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards);
            expect(threeCards.map((item: { sourceRef: { rowId: string; }; }) => item.sourceRef.rowId))
                .to.deep.equal(["r1", "r1", "r2"]);
            const distinctGuard = f.server.kanbanObservations.acquire(UID, PROJECT, three.payload.observationToken);
            for (const rowId of ["r1", "r2"]) {
                distinctGuard.assertCurrent({
                    kind: "table-field",
                    kanbanId: "board",
                    scopeId: tableScope("tasks", rowId, "title"),
                    sourceRef: { kind: "table", id: "tasks", sqlName: "tasks", rowId },
                    outputField: "title",
                    physicalColumn: "title",
                    role: "title",
                });
            }
            distinctGuard.release();
            await f.server.kanbanObservations.release(three.payload.observationToken);

            await seedCollisionProneScopes(f.server.hocuspocus);
            const punctuated = await call("query_kanban", { projectId: PROJECT, kanbanId: "board", maxCards: 2 });
            expect(punctuated.payload.mutationObservation).to.deep.equal({ available: true });
            const punctuatedCards = punctuated.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards);
            expect(punctuatedCards.map((card: { sourceRef: { rowId: string; }; }) => card.sourceRef.rowId))
                .to.deep.equal(["a", "a:b"]);
            const punctuatedGuard = f.server.kanbanObservations.acquire(
                UID,
                PROJECT,
                punctuated.payload.observationToken,
            );
            for (const card of punctuatedCards) {
                for (
                    const [outputField, physicalColumn, role] of [
                        ["c", "title", "title"],
                        ["b:c", "detail", "detail"],
                        ["status", "status", "group"],
                    ] as const
                ) {
                    punctuatedGuard.assertCurrent({
                        kind: "table-field",
                        kanbanId: "board",
                        scopeId: tableScope("tasks", card.sourceRef.rowId, outputField),
                        sourceRef: card.sourceRef,
                        outputField,
                        physicalColumn,
                        role,
                    });
                }
            }
            punctuatedGuard.release();
            await f.server.kanbanObservations.release(punctuated.payload.observationToken);
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
                if (check === 3) f.acl.revokeAll(PROJECT);
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

    it("snapshots metadata settings at capture and reauthorizes after diagnostic cleanup", async () => {
        const f = await startMcpTestServer();
        try {
            await seedBoard(f.server.hocuspocus);
            f.seams.gate = async (requestId, check) => {
                if (requestId !== "coherent-settings" || check !== 3) return;
                const doc = f.server.hocuspocus.documents.get(`projects/${PROJECT}`) as Y.Doc;
                applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, { name: "Changed concurrently" });
            };
            const metadata = await f.mcp.call("get_kanban", { projectId: PROJECT, kanbanId: "board" }, {
                requestId: "coherent-settings",
            });
            expect(metadata.result.isError, JSON.stringify(metadata)).not.to.equal(true);
            expect(metadata.payload.settings.name).to.equal("Board");
            const metadataGuard = f.server.kanbanObservations.acquire(
                UID,
                PROJECT,
                metadata.payload.observationToken,
            );
            expect(() => metadataGuard.assertCurrent({ kind: "definition", kanbanId: "board", keys: ["name"] })).to
                .throw("observation_changed");
            metadataGuard.release();
            await f.server.kanbanObservations.release(metadata.payload.observationToken);

            await withRoom(f.server.hocuspocus, `projects/${PROJECT}`, doc => {
                applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, { query: "SELECT FROM" });
            });
            let observedOpenRoom = false;
            f.seams.gate = async requestId => {
                if (requestId !== "revoked-after-cleanup") return;
                const open = f.server.hocuspocus.documents.has(`projects/${PROJECT}`);
                if (open) observedOpenRoom = true;
                else if (observedOpenRoom) f.acl.revokeAll(PROJECT);
            };
            const denied = await f.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" }, {
                requestId: "revoked-after-cleanup",
            });
            expect(denied.result.isError).to.equal(true);
            expect(denied.payload.code).to.equal("forbidden");
        } finally {
            await f.stop();
        }
    });

    it("reauthorizes thrown source errors after their room cleanup", async () => {
        const f = await startMcpTestServer();
        try {
            const allowed = await f.mcp.call("get_kanban", {
                projectId: PROJECT,
                kanbanId: "missing-board",
            });
            expect(allowed.result.isError).to.equal(true);
            expect(allowed.payload.code).to.equal("not_found");

            let observedOpenRoom = false;
            f.seams.gate = async requestId => {
                if (requestId !== "revoked-thrown-error") return;
                const open = f.server.hocuspocus.documents.has(`projects/${PROJECT}`);
                if (open) observedOpenRoom = true;
                else if (observedOpenRoom) f.acl.revokeAll(PROJECT);
            };
            const denied = await f.mcp.call("get_kanban", {
                projectId: PROJECT,
                kanbanId: "missing-board",
            }, { requestId: "revoked-thrown-error" });
            expect(observedOpenRoom).to.equal(true);
            expect(denied.result.isError).to.equal(true);
            expect(denied.payload.code).to.equal("forbidden");
            expect(denied.payload.code).not.to.equal("not_found");
        } finally {
            await f.stop();
        }
    });

    it("reauthorizes missing Kanban URL errors after room cleanup", async () => {
        const f = await startMcpTestServer();
        try {
            const url = "https://outliner.example/Project%20proj-a/-/kanbans/missing-board";
            const allowed = await f.mcp.call("resolve_url", { url });
            expect(allowed.result.isError).to.equal(true);
            expect(allowed.payload.code).to.equal("not_found");
            expect(allowed.payload).to.include({ stage: "entity_lookup", entityKind: "kanbans" });

            const reachedCleanup = deferred();
            const resumeCleanup = deferred();
            f.seams.beforeReadRoomDisconnect = async room => {
                if (room !== `projects/${PROJECT}`) return;
                reachedCleanup.resolve();
                await resumeCleanup.promise;
            };
            const pending = f.mcp.call("resolve_url", { url }, { requestId: "revoked-url-error" });
            await reachedCleanup.promise;
            f.acl.revokeAll(PROJECT);
            resumeCleanup.resolve();
            const denied = await pending;
            expect(denied.result.isError).to.equal(true);
            expect(denied.payload.code).to.equal("forbidden");
            expect(denied.payload.code).not.to.equal("not_found");
            expect(denied.payload).not.to.have.property("stage", "entity_lookup");
            expect(f.server.hocuspocus.documents.has(`projects/${PROJECT}`)).to.equal(false);
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
        doc.getText("schema").insert(
            0,
            "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT, detail TEXT)",
        );
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        row.set("title", "First");
        doc.getMap("data").set("r1", row);
    });
}

async function seedCollisionProneScopes(host: Parameters<typeof withRoom>[0]): Promise<void> {
    await withRoom(host, `projects/${PROJECT}`, doc => {
        applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, {
            query: "SELECT id, status, title AS c, detail AS \"b:c\" FROM tasks WHERE id IN ('a', 'a:b') ORDER BY id",
            groupField: "status",
            titleField: "c",
            detailFields: ["b:c"],
        });
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        for (const id of ["a", "a:b"]) {
            const row = new Y.Map<unknown>();
            row.set("status", "todo");
            row.set("title", `Title ${id}`);
            row.set("detail", `Detail ${id}`);
            doc.getMap("data").set(id, row);
        }
    });
}

const tableScope = (tableId: string, rowId: string, outputField: string) =>
    JSON.stringify([tableId, rowId, outputField]);

async function seedDuplicateOccurrences(host: Parameters<typeof withRoom>[0]): Promise<void> {
    await withRoom(host, `projects/${PROJECT}`, doc => {
        applyKanbanUpdates(getKanbanDefinitionTarget(doc, "board")!, {
            query: `SELECT 'tasks' AS source_kind, id AS source_id, title, status FROM tasks WHERE id = 'r1'
                UNION ALL SELECT 'tasks', id, title, status FROM tasks WHERE id = 'r1'
                UNION ALL SELECT 'tasks', id, title, status FROM tasks WHERE id = 'r2'`,
            detailFields: [],
        });
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        row.set("title", "Second");
        doc.getMap("data").set("r2", row);
    });
}
