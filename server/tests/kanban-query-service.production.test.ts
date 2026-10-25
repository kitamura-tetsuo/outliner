import { expect } from "chai";
import * as Y from "yjs";
import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
} from "../../shared/src/services/kanbanDefinition.js";
import { OutlinerKanbanQueryService } from "../src/mcp/kanban-query-service.js";
import { Project } from "../src/schema/app-schema.js";

const UID = "owner", PROJECT = "kanban-production";

async function seed(host: any, query: string, table = false, settings: Record<string, unknown> = {}) {
    const project = await host.openDirectConnection(`projects/${PROJECT}`, { context: { uid: UID } });
    const doc = project.document as unknown as Y.Doc;
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(Project.createInstance("Kanban production").ydoc));
    if (table) {
        const entry = new Y.Map<unknown>();
        entry.set("name", "Tasks");
        entry.set("sqlName", "tasks");
        doc.getMap("yjsTables").set("tasks", entry);
    }
    createKanbanEntry(doc as never, "board", {
        query,
        groupField: "status",
        laneOrder: ["done", "todo"],
        ...settings,
    });
    const held = [project];
    if (table) {
        const source = await host.openDirectConnection(`projects/${PROJECT}/tables/tasks`, { context: { uid: UID } });
        const sourceDoc = source.document as unknown as Y.Doc;
        sourceDoc.getText("schema").insert(0, "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, title TEXT)");
        for (const [id, status, title] of [["a", "todo", "A"], ["b", "done", "B"]]) {
            const row = new Y.Map<unknown>();
            row.set("status", status);
            row.set("title", title);
            sourceDoc.getMap("data").set(id, row);
        }
        held.push(source);
    }
    return held;
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => resolve = done);
    return { promise, resolve };
}

async function projectWithClient(query: string) {
    Object.assign(globalThis, {
        $state: <T>(value: T) => value,
        $derived: <T>(value: T) => value,
        $effect: () => undefined,
        $props: () => ({}),
        $bindable: <T>(value: T) => value,
        $inspect: <T>(value: T) => value,
    });
    const [{ KanbanQueryRunner }, { createKanban, getKanbanHandles }] = await Promise.all([
        import("../../client/src/services/yjstable/kanbanQueryRunner.js"),
        import("../../client/src/services/yjstable/kanbanDocs.js"),
    ]);
    const doc = new Y.Doc({ guid: "kanban-production-client" });
    const kanbanId = createKanban(doc, { query, groupField: "status" });
    const runner = new KanbanQueryRunner({
        projectDoc: doc,
        kanbanId,
        kanban: getKanbanHandles(doc, kanbanId)!,
    });
    let projection: any;
    const unsubscribe = runner.subscribeProjection(value => projection = value);
    runner.start();
    await runner.runQueryNow();
    unsubscribe();
    runner.dispose();
    return projection;
}

describe("Kanban observation production rooms and client parity", function() {
    this.timeout(30000);
    let server: any;
    let stop: (server: unknown) => Promise<void>;
    beforeEach(async () => {
        const fixture = await import("./server-create-table-fixture.js");
        const acl = new fixture.AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        server = await fixture.startTestServer(fixture.tempDir(), acl);
        stop = fixture.stopTestServer;
    });
    afterEach(async () => stop(server));

    it("projects independently expected server edge-key and duplicate occurrence projection", async () => {
        const query = `SELECT 'card' AS title, status FROM (VALUES
            (NULL::text), (''), (' '), ('NULL'), ('2')) AS v(status)
            UNION ALL SELECT 'duplicate', '2'`;
        const held = await seed(server.hocuspocus, query);
        const service = new OutlinerKanbanQueryService(server.hocuspocus, async () => true);
        const observed = await service.openObservation(UID, PROJECT, "board");
        const expectedKeys = [null, "", " ", "NULL", "2"];
        expect(observed.status).to.equal("success");
        expect(observed.lanes.map(lane => lane.key)).to.deep.equal(expectedKeys);
        expect(observed.lanes.flatMap(lane => lane.cards)).to.have.length(6);
        expect(observed.lanes.find(lane => lane.key === "2")!.cards).to.have.length(2);
        const client = await projectWithClient(query);
        expect(client.status).to.equal("success");
        expect(client.lanes.map((lane: any) => lane.key)).to.deep.equal(expectedKeys);
        expect(client.lanes.flatMap((lane: any) => lane.cards)).to.have.length(6);
        await observed.release();
        await Promise.all(held.map(connection => connection.disconnect()));
    });

    it("retains real live Project/Table handles until idempotent release without changing documents", async () => {
        const held = await seed(
            server.hocuspocus,
            "SELECT id, status, title FROM tasks ORDER BY id LIMIT 2",
            true,
        );
        const project = server.hocuspocus.documents.get(`projects/${PROJECT}`)! as unknown as Y.Doc;
        const source = server.hocuspocus.documents.get(`projects/${PROJECT}/tables/tasks`)! as unknown as Y.Doc;
        const before = [Y.encodeStateAsUpdate(project), Y.encodeStateAsUpdate(source)].map(Buffer.from);
        const observed = await new OutlinerKanbanQueryService(server.hocuspocus, async () => true)
            .openObservation(UID, PROJECT, "board");
        expect(observed.lanes.map(lane => [lane.key, lane.cards.map(card => card.source?.rowId)])).to.deep.equal([
            ["done", ["b"]],
            ["todo", ["a"]],
        ]);
        expect(observed.isCurrent()).to.equal(true);
        await observed.release();
        await observed.release();
        expect(observed.isCurrent()).to.equal(false);
        expect(Buffer.from(Y.encodeStateAsUpdate(project)).equals(before[0])).to.equal(true);
        expect(Buffer.from(Y.encodeStateAsUpdate(source)).equals(before[1])).to.equal(true);
        await Promise.all(held.map(connection => connection.disconnect()));
        expect(server.hocuspocus.documents.has(`projects/${PROJECT}`)).to.equal(false);
        expect(server.hocuspocus.documents.has(`projects/${PROJECT}/tables/tasks`)).to.equal(false);
    });

    it("covers ordered Table results, physical/computed routes, zero rows, and diagnostics", async () => {
        const held = await seed(
            server.hocuspocus,
            "SELECT id, status, title || '!' AS display FROM tasks ORDER BY id DESC LIMIT 1",
            true,
            { titleField: "display", detailFields: ["status"] },
        );
        const service = new OutlinerKanbanQueryService(server.hocuspocus, async () => true);
        const result = await service.openObservation(UID, PROJECT, "board");
        expect(result.lanes.map(lane => [lane.key, lane.cards.map(card => card.source?.rowId)])).to.deep.equal([
            ["done", ["b"]],
        ]);
        expect(result.routes.find(route => route.output === "status")?.writable).to.equal(true);
        expect(result.routes.find(route => route.output === "display")).to.include({ writable: false });
        await result.release();

        const project = held[0].document as unknown as Y.Doc;
        const target = getKanbanDefinitionTarget(project as never, "board")!;
        applyKanbanUpdates(target, {
            query: "SELECT id, status, title || '!' AS display FROM tasks WHERE FALSE",
        });
        const empty = await service.openObservation(UID, PROJECT, "board");
        expect(empty.status).to.equal("success");
        expect(empty.lanes.flatMap(lane => lane.cards)).to.deep.equal([]);
        await empty.release();
        applyKanbanUpdates(target, { query: "SELECT FROM" });
        const invalid = await service.openObservation(UID, PROJECT, "board");
        expect(invalid).to.include({ status: "invalid", reason: "invalid_query" });
        await Promise.all(held.map(connection => connection.disconnect()));
    });

    it("enforces exact and exceeded complete-result occurrence limits", async () => {
        const held = await seed(
            server.hocuspocus,
            "SELECT 'lane' AS status FROM generate_series(1, 10000)",
        );
        const service = new OutlinerKanbanQueryService(server.hocuspocus, async () => true);
        const exact = await service.openObservation(UID, PROJECT, "board");
        expect(exact.status).to.equal("success");
        expect(exact.lanes[0].cards).to.have.length(10000);
        await exact.release();
        const target = getKanbanDefinitionTarget(held[0].document as never, "board")!;
        applyKanbanUpdates(target, { query: "SELECT 'lane' AS status FROM generate_series(1, 10001)" });
        const overflow = await service.openObservation(UID, PROJECT, "board");
        expect(overflow).to.include({ status: "unavailable", reason: "resource_limit", limit: "rows" });
        expect(overflow.lanes).to.deep.equal([]);
        expect(overflow.routes).to.deep.equal([]);
        await Promise.all(held.map(connection => connection.disconnect()));
    });

    it("detects real-room source-opening and post-execution changes, then recovers fresh", async () => {
        const held = await seed(server.hocuspocus, "SELECT id, status FROM tasks ORDER BY id", true);
        const project = held[0].document as unknown as Y.Doc;
        const source = held[1].document as unknown as Y.Doc;
        const target = getKanbanDefinitionTarget(project as never, "board")!;
        const opened = deferred(), resumeOpen = deferred();
        const opening = new OutlinerKanbanQueryService(server.hocuspocus, async () => true, {
            beforeSourceOpen: async () => {
                opened.resolve();
                await resumeOpen.promise;
            },
        }).openObservation(UID, PROJECT, "board");
        await opened.promise;
        applyKanbanUpdates(target, { query: "SELECT id, status FROM tasks WHERE FALSE" });
        resumeOpen.resolve();
        const staleOpen = await opening;
        expect(staleOpen).to.include({ status: "unavailable", reason: "stale_evidence" });
        expect(staleOpen.routes).to.deep.equal([]);

        applyKanbanUpdates(target, { query: "SELECT id, status FROM tasks ORDER BY id" });
        const executed = deferred(), resumeExecution = deferred();
        const pending = new OutlinerKanbanQueryService(server.hocuspocus, async () => true, {
            beforeFinalCertification: async () => {
                executed.resolve();
                await resumeExecution.promise;
            },
        }).openObservation(UID, PROJECT, "board");
        await executed.promise;
        source.getMap("data").delete("a");
        resumeExecution.resolve();
        const staleExecution = await pending;
        expect(staleExecution).to.include({ status: "unavailable", reason: "stale_evidence" });
        expect(staleExecution.routes).to.deep.equal([]);
        const fresh = await new OutlinerKanbanQueryService(server.hocuspocus, async () => true)
            .openObservation(UID, PROJECT, "board");
        expect(fresh.status).to.equal("success");
        expect(fresh.lanes.flatMap(lane => lane.cards.map(card => card.source?.rowId))).to.deep.equal(["b"]);
        await fresh.release();
        await Promise.all(held.map(connection => connection.disconnect()));
    });

    it("materializes canonical outline rows through the production room", async () => {
        const held = await seed(
            server.hocuspocus,
            "SELECT id, text AS status FROM outline_items WHERE start_on = DATE '2026-10-25'",
        );
        const project = Project.fromDoc(held[0].document as never);
        const page = project.addPage("Schedule", UID);
        const allDay = page.items.addNode(UID);
        allDay.updateText("all-day");
        allDay.yMap.set("start", "2026-10-25");
        allDay.yMap.set("allDay", true);
        const timed = page.items.addNode(UID);
        timed.updateText("timed");
        timed.yMap.set("start", "2026-10-25T09:00:00Z");
        timed.yMap.set("allDay", false);
        const service = new OutlinerKanbanQueryService(server.hocuspocus, async () => true);
        const date = await service.openObservation(UID, PROJECT, "board");
        expect(date.lanes.map(lane => lane.key)).to.deep.equal(["all-day"]);
        expect(date.lanes[0].cards[0].source).to.include({ kind: "system", sqlName: "outline_items" });
        await date.release();
        applyKanbanUpdates(getKanbanDefinitionTarget(held[0].document as never, "board")!, {
            query: "SELECT id, text AS status FROM outline_items WHERE start_at IS NOT NULL",
        });
        const instant = await service.openObservation(UID, PROJECT, "board");
        expect(instant.lanes.map(lane => lane.key)).to.deep.equal(["timed"]);
        await instant.release();
        await Promise.all(held.map(connection => connection.disconnect()));
    });
});
