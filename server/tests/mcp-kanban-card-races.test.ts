import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import {
    auditRecords,
    deferred,
    PROJECT,
    settleMicrotasks,
    startMcpTestServer,
    UID,
} from "./mcp-create-table-fixture.js";
import { withRoom } from "./server-create-table-fixture.js";

describe("Kanban card mutation races and effect disclosure", function() {
    this.timeout(120_000);

    it("retries one unrelated projection drift and succeeds in the same request", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            let certifications = 0;
            fixture.seams.beforeKanbanFinalCertification = async () => {
                if (++certifications !== 1) return;
                mutateNote(fixture, `peer-${certifications}`);
            };
            const result = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "retry-once"));
            expect(result.payload).to.include({ applied: true });
            expect(certifications).to.equal(2);
            expect(currentTitle(fixture)).to.equal("Changed");
        } finally {
            await fixture.stop();
        }
    });

    it("exhausts three continuously stale projections without an effect", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            let certifications = 0;
            fixture.seams.beforeKanbanFinalCertification = async () => mutateNote(fixture, `peer-${++certifications}`);
            const result = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "retry-three"));
            expect(result.result.isError).to.equal(true);
            expect(result.payload).to.include({ code: "stale_revision", reason: "concurrent_changes" });
            expect(certifications).to.equal(3);
            expect(currentTitle(fixture)).to.equal("First");
        } finally {
            await fixture.stop();
        }
    });

    it("joins simultaneous calls with the same operation identity into one physical effect", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            const reached = deferred(), release = deferred();
            let certifications = 0;
            fixture.seams.beforeKanbanFinalCertification = async () => {
                certifications++;
                reached.resolve();
                await release.promise;
            };
            const request = updateArgs(read, card, "joined-operation");
            const beforeStores = fixture.kanbanStoreCalls;
            const first = fixture.mcp.call("update_kanban_card", request);
            await reached.promise;
            const second = fixture.mcp.call("update_kanban_card", request);
            await settleMicrotasks();
            release.resolve();
            const results = await Promise.all([first, second]);
            expect(results.map(result => result.payload.replayed).sort()).to.deep.equal([false, true]);
            expect(results.every(result => result.payload.applied === true)).to.equal(true);
            expect(certifications).to.equal(1);
            expect(fixture.kanbanStoreCalls - beforeStores).to.equal(1);
        } finally {
            await fixture.stop();
        }
    });

    it("audits a durable effect truthfully when authorization is revoked before disclosure", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            fixture.seams.afterStore = room => {
                if (room.endsWith("/tables/tasks")) fixture.acl.revokeAll(PROJECT);
            };
            const result = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "revoked-effect"));
            expect(result.result.isError).to.equal(true);
            expect(result.payload).to.include({ code: "forbidden" });
            expect(result.payload).not.to.have.property("sourceRef");
            expect(currentTitle(fixture)).to.equal("Changed");
            expect((await auditRecords(["revoked-effect"]))[0]).to.include({
                tool: "update_kanban_card",
                operationId: "revoked-effect",
                outcome: "forbidden",
                applied: true,
                replayed: false,
            });
            fixture.seams.afterStore = undefined;
            fixture.acl.grant("projectUsers", PROJECT, UID);
            const stores = fixture.kanbanStoreCalls;
            const replay = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "revoked-effect"));
            expect(replay.payload).to.include({ applied: true, replayed: true });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
        } finally {
            await fixture.stop();
        }
    });

    it("retains applied:null when acknowledgement fails and disclosure is revoked", async () => {
        const fixture = await startMcpTestServer();
        try {
            await seed(fixture.server.hocuspocus);
            const { read, card } = await observed(fixture);
            fixture.seams.afterStore = room => {
                if (!room.endsWith("/tables/tasks")) return;
                fixture.acl.revokeAll(PROJECT);
                throw new Error("controlled post-store acknowledgement failure");
            };
            const result = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "revoked-unknown"));
            expect(result.result.isError).to.equal(true);
            expect(result.payload).to.include({ code: "forbidden" });
            expect(currentTitle(fixture)).to.equal("Changed");
            expect((await auditRecords(["revoked-unknown"]))[0]).to.include({
                operationId: "revoked-unknown",
                outcome: "forbidden",
                applied: null,
                replayed: false,
            });
            fixture.seams.afterStore = undefined;
            fixture.acl.grant("projectUsers", PROJECT, UID);
            const stores = fixture.kanbanStoreCalls;
            const replay = await fixture.mcp.call("update_kanban_card", updateArgs(read, card, "revoked-unknown"));
            expect(replay.result.isError).to.equal(true);
            expect(replay.payload).to.include({ code: "internal_failure", applied: null, replayed: true });
            expect(fixture.kanbanStoreCalls).to.equal(stores);
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
        });
    });
    await withRoom(host, `projects/${PROJECT}/tables/tasks`, doc => {
        doc.getText("schema").insert(
            0,
            "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT NOT NULL, note TEXT)",
        );
        for (const [id, title] of [["r1", "First"], ["r2", "Second"]]) {
            const row = new Y.Map<unknown>();
            row.set("status", "todo");
            row.set("title", title);
            row.set("note", "initial");
            doc.getMap("data").set(id, row);
        }
    });
}

async function observed(fixture: Awaited<ReturnType<typeof startMcpTestServer>>) {
    const response = await fixture.mcp.call("query_kanban", { projectId: PROJECT, kanbanId: "board" });
    const card = response.payload.lanes.flatMap((lane: any) => lane.cards)
        .find((candidate: any) => candidate.sourceRef?.rowId === "r1");
    return { read: response.payload, card };
}
const updateArgs = (read: any, card: any, operationId: string) => ({
    projectId: PROJECT,
    kanbanId: "board",
    sourceRef: card.sourceRef,
    observationToken: read.observationToken,
    outputField: "title",
    value: "Changed",
    operationId,
});
function mutateNote(fixture: Awaited<ReturnType<typeof startMcpTestServer>>, value: string) {
    const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`) as Y.Doc;
    doc.getMap<Y.Map<unknown>>("data").get("r2")!.set("note", value);
}
function currentTitle(fixture: Awaited<ReturnType<typeof startMcpTestServer>>) {
    const doc = fixture.server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`) as Y.Doc;
    return doc.getMap<Y.Map<unknown>>("data").get("r1")!.get("title");
}
