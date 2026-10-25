import { expect } from "chai";
import * as Y from "yjs";
import { createKanbanEntry } from "../../shared/src/services/kanbanDefinition.js";
import { OutlinerKanbanQueryService } from "../src/mcp/kanban-query-service.js";
import { Project } from "../src/schema/app-schema.js";

const UID = "owner", PROJECT = "kanban-production";

async function seed(host: any, query: string, table = false) {
    const project = await host.openDirectConnection(`projects/${PROJECT}`, { context: { uid: UID } });
    const doc = project.document as unknown as Y.Doc;
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(Project.createInstance("Kanban production").ydoc));
    if (table) {
        const entry = new Y.Map<unknown>();
        entry.set("name", "Tasks");
        entry.set("sqlName", "tasks");
        doc.getMap("yjsTables").set("tasks", entry);
    }
    createKanbanEntry(doc as never, "board", { query, groupField: "status", laneOrder: ["done", "todo"] });
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
    });
});
