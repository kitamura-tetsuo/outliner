import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { createDocumentStore } from "../src/persistence.js";
import { Project } from "../src/schema/app-schema.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";
import { PROJECT, startMcpTestServer, UID } from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban card mutations through production MCP", function() {
    this.timeout(120_000);

    it("edits and moves the observed physical record, with dry-run and replay safety", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const read = await fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
            expect(read.result.isError, JSON.stringify(read.payload)).not.to.equal(true);
            const card = read.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards)[0];
            const common = {
                projectId: PROJECT,
                kanbanId: "board",
                sourceRef: card.sourceRef,
                observationToken: read.payload.observationToken,
            };
            const preview = await fixture.mcp.call("update_kanban_card", {
                ...common,
                outputField: "title",
                value: "Preview only",
                operationId: "preview-edit",
                dryRun: true,
            });
            expect(preview.payload).to.include({ applied: false, dryRun: true, wouldChange: true });
            expect(await title(fixture.server.hocuspocus)).to.equal("First");

            const applied = await fixture.mcp.call("update_kanban_card", {
                ...common,
                outputField: "title",
                value: "Changed",
                operationId: "edit-1",
            });
            expect(applied.payload).to.include({ operation: "update", applied: true, replayed: false });
            expect(await title(fixture.server.hocuspocus)).to.equal("Changed");

            const replay = await fixture.mcp.call("update_kanban_card", {
                ...common,
                outputField: "title",
                value: "Changed",
                operationId: "edit-1",
            });
            expect(replay.payload).to.include({ applied: true, replayed: true });

            const fresh = await fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
            const moved = await fixture.mcp.call("move_kanban_card", {
                projectId: PROJECT,
                kanbanId: "board",
                sourceRef: fresh.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards)[0].sourceRef,
                observationToken: fresh.payload.observationToken,
                destination: "done",
                operationId: "move-1",
            });
            expect(moved.payload).to.include({ operation: "move", applied: true });
            expect(await status(fixture.server.hocuspocus)).to.equal("done");
        } finally {
            await fixture.stop();
        }
    });

    it("moves a card into an empty lane declared by the current ENUM catalog", async () => {
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
                            id: "kanban-lane-enum",
                            kind: "enum",
                            source: "CREATE TYPE kanban_lane AS ENUM ('todo', 'empty', 'done')",
                        },
                    },
                })).status,
            ).to.equal("applied");
            await seedEnum(fixture.server.hocuspocus);

            const read = await fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "enum-board" });
            expect(read.payload.lanes.map((lane: { key: string; }) => lane.key)).to.deep.equal([
                "todo",
                "empty",
                "done",
            ]);
            const card = read.payload.lanes.flatMap((lane: { cards: unknown[]; }) => lane.cards)[0];
            const moved = await fixture.mcp.call("move_kanban_card", {
                projectId: PROJECT,
                kanbanId: "enum-board",
                sourceRef: card.sourceRef,
                observationToken: read.payload.observationToken,
                destination: "empty",
                operationId: "move-to-empty-enum-lane",
            });
            expect(moved.payload).to.include({ applied: true, operation: "move" });
            expect(await status(fixture.server.hocuspocus)).to.equal("empty");
        } finally {
            await fixture.stop();
        }
    });
});

async function seed(host: Parameters<typeof withRoom>[0]) {
    await withRoom(host, `projects/${PROJECT}`, doc => {
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        doc.getMap("yjsTables").set("tasks", table);
        createKanbanEntry(doc, "board", {
            name: "Board",
            query: "SELECT id, status, title FROM tasks ORDER BY id",
            groupField: "status",
            titleField: "title",
            detailFields: [],
            laneOrder: ["todo", "done"],
        });
        expect(Project.fromDoc(doc).items.length).to.be.greaterThan(0);
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        doc.getText("schema").insert(0, "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT NOT NULL)");
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        row.set("title", "First");
        doc.getMap("data").set("r1", row);
        const done = new Y.Map<unknown>();
        done.set("status", "done");
        done.set("title", "Second");
        doc.getMap("data").set("r2", done);
    });
}

async function seedEnum(host: Parameters<typeof withRoom>[0]) {
    await withRoom(host, `projects/${PROJECT}`, doc => {
        const table = new Y.Map<unknown>();
        table.set("name", "Tasks");
        table.set("sqlName", "tasks");
        doc.getMap("yjsTables").set("tasks", table);
        createKanbanEntry(doc, "enum-board", {
            name: "ENUM board",
            query: "SELECT id, status, title FROM tasks ORDER BY id",
            groupField: "status",
            titleField: "title",
            detailFields: [],
        });
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        doc.getText("schema").insert(
            0,
            "CREATE TABLE tasks(id TEXT PRIMARY KEY, status kanban_lane NOT NULL, title TEXT NOT NULL)",
        );
        const row = new Y.Map<unknown>();
        row.set("status", "todo");
        row.set("title", "First");
        doc.getMap("data").set("r1", row);
    });
}

const title = (host: Parameters<typeof withRoom>[0]) => value(host, "title");
const status = (host: Parameters<typeof withRoom>[0]) => value(host, "status");
async function value(host: Parameters<typeof withRoom>[0], field: string) {
    let result: unknown;
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        result = (doc.getMap<Y.Map<unknown>>("data").get("r1"))?.get(field);
    });
    return result;
}
