import { expect } from "chai";
import * as Y from "yjs";
import {
    applyKanbanUpdates,
    createKanbanEntry,
    getKanbanDefinitionTarget,
} from "../../shared/src/services/kanbanDefinition.js";
import { OutlinerKanbanQueryService } from "../src/mcp/kanban-query-service.js";
import { McpReadError } from "../src/mcp/mcp-error.js";
import { Project } from "../src/schema/app-schema.js";

class RoomHost {
    readonly documents = new Map<string, Y.Doc>();
    async openDirectConnection(room: string) {
        let document = this.documents.get(room);
        if (!document) {
            document = new Y.Doc();
            Object.defineProperty(document, "name", { value: room });
            this.documents.set(room, document);
        }
        return { document, disconnect: async () => {}, context: {} };
    }
    async destroy() {
        for (const doc of this.documents.values()) doc.destroy();
        this.documents.clear();
    }
}

const UID = "owner", PROJECT = "kanban-observation";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => resolve = done);
    return { promise, resolve };
}

async function seed(server: RoomHost, query: string, options: {
    groupField?: string;
    titleField?: string;
    detailFields?: string[];
    schema?: string;
    rows?: Record<string, unknown>[];
} = {}) {
    const projectConnection = await server.openDirectConnection(`projects/${PROJECT}`, {
        context: { uid: UID },
    });
    const projectDoc = projectConnection.document as unknown as Y.Doc;
    const created = Project.createInstance("Kanban observation");
    Y.applyUpdate(projectDoc, Y.encodeStateAsUpdate(created.ydoc));
    const table = new Y.Map<unknown>();
    table.set("name", "Tasks");
    table.set("sqlName", "tasks");
    projectDoc.getMap("yjsTables").set("tasks-id", table);
    createKanbanEntry(projectDoc as never, "board", {
        query,
        groupField: options.groupField ?? "status",
        titleField: options.titleField,
        detailFields: options.detailFields,
        laneOrder: ["done", "todo"],
    });
    await projectConnection.disconnect();
    const tableConnection = await server.openDirectConnection(`projects/${PROJECT}/tables/tasks-id`, {
        context: { uid: UID },
    });
    const tableDoc = tableConnection.document as unknown as Y.Doc;
    tableDoc.getText("schema").insert(0, options.schema ?? "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT)");
    for (const values of options.rows ?? [{ id: "r1", status: "todo" }]) {
        const record = new Y.Map<unknown>();
        for (const [key, value] of Object.entries(values)) record.set(key, value);
        tableDoc.getMap("data").set(String(values.id), record);
    }
    await tableConnection.disconnect();
}

async function tableDoc(server: RoomHost) {
    const connection = await server.openDirectConnection(`projects/${PROJECT}/tables/tasks-id`, {
        context: { uid: UID },
    });
    return { connection, doc: connection.document as unknown as Y.Doc };
}

describe("server Kanban observation", function() {
    this.timeout(30000);
    let server: RoomHost;
    beforeEach(() => server = new RoomHost());
    afterEach(async () => server.destroy());

    it("preserves forbidden when access is revoked at the execution barrier", async () => {
        await seed(server, "SELECT id, status FROM tasks");
        let allowed = true;
        const reached = deferred(), release = deferred();
        const service = new OutlinerKanbanQueryService(server as never, async () => allowed, {
            beforeCertification: async () => {
                reached.resolve();
                await release.promise;
            },
        });
        const pending = service.openObservation(UID, PROJECT, "board");
        await reached.promise;
        allowed = false;
        release.resolve();
        try {
            await pending;
            expect.fail("expected forbidden");
        } catch (error) {
            expect(error).to.be.instanceOf(McpReadError);
            expect((error as McpReadError).code).to.equal("forbidden");
        }
    });

    it("keeps the definition baseline across asynchronous source opening and ABA edits", async () => {
        const query = "SELECT id, status FROM tasks";
        await seed(server, query);
        const reached = deferred(), release = deferred();
        const service = new OutlinerKanbanQueryService(server as never, async () => true, {
            beforeSourceOpen: async () => {
                reached.resolve();
                await release.promise;
            },
        });
        const pending = service.openObservation(UID, PROJECT, "board");
        await reached.promise;
        const connection = await server.openDirectConnection(`projects/${PROJECT}`);
        const target = getKanbanDefinitionTarget(connection.document as never, "board")!;
        applyKanbanUpdates(target, { query: `${query} WHERE FALSE` });
        applyKanbanUpdates(target, { query });
        release.resolve();
        const stale = await pending;
        expect(stale).to.include({ status: "unavailable", reason: "stale_evidence" });
        expect(stale.routes).to.deep.equal([]);

        applyKanbanUpdates(target, { query: `${query} WHERE FALSE` });
        const fresh = await new OutlinerKanbanQueryService(server as never, async () => true).openObservation(
            UID,
            PROJECT,
            "board",
        );
        expect(fresh.status).to.equal("success");
        expect(fresh.lanes.flatMap(lane => lane.cards)).to.deep.equal([]);
        await fresh.release();
    });

    it("does not refresh the definition baseline between multiple source opens", async () => {
        await seed(server, "SELECT id, status FROM tasks UNION ALL SELECT id, status FROM archive");
        const project = await server.openDirectConnection(`projects/${PROJECT}`);
        const archive = new Y.Map<unknown>();
        archive.set("name", "Archive");
        archive.set("sqlName", "archive");
        project.document.getMap("yjsTables").set("archive-id", archive);
        const archiveRoom = await server.openDirectConnection(`projects/${PROJECT}/tables/archive-id`);
        archiveRoom.document.getText("schema").insert(
            0,
            "CREATE TABLE archive(id TEXT PRIMARY KEY, status TEXT)",
        );
        const reached = deferred(), release = deferred();
        const service = new OutlinerKanbanQueryService(server as never, async () => true, {
            beforeSourceOpen: async (_id, index) => {
                if (index !== 1) return;
                reached.resolve();
                await release.promise;
            },
        });
        const pending = service.openObservation(UID, PROJECT, "board");
        await reached.promise;
        applyKanbanUpdates(getKanbanDefinitionTarget(project.document as never, "board")!, {
            query: "SELECT id, status FROM tasks WHERE FALSE",
        });
        release.resolve();
        const stale = await pending;
        expect(stale).to.include({ status: "unavailable", reason: "stale_evidence" });
        expect(stale.routes).to.deep.equal([]);
    });

    it("treats pure row deletion as stale before certification and after return", async () => {
        await seed(server, "SELECT id, status FROM tasks");
        const reached = deferred(), release = deferred();
        const service = new OutlinerKanbanQueryService(server as never, async () => true, {
            beforeCertification: async () => {
                reached.resolve();
                await release.promise;
            },
        });
        const pending = service.openObservation(UID, PROJECT, "board");
        await reached.promise;
        const live = await tableDoc(server);
        live.doc.getMap("data").delete("r1");
        release.resolve();
        const stale = await pending;
        expect(stale).to.include({ status: "unavailable", reason: "stale_evidence" });
        const replacement = new Y.Map<unknown>();
        replacement.set("id", "r2");
        replacement.set("status", "todo");
        live.doc.getMap("data").set("r2", replacement);
        await live.connection.disconnect();
        const fresh = await new OutlinerKanbanQueryService(server as never, async () => true).openObservation(
            UID,
            PROJECT,
            "board",
        );
        const source = await tableDoc(server);
        source.doc.getMap("data").delete("r2");
        expect(fresh.isCurrent()).to.equal(false);
        await fresh.release();
        await source.connection.disconnect();
    });

    it("includes unoccupied CHECK lanes without lending choices to computed groups", async () => {
        const schema = "CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT CHECK(status IN ('todo','done')))";
        await seed(server, "SELECT id, status FROM tasks WHERE FALSE", { schema, rows: [] });
        const service = new OutlinerKanbanQueryService(server as never, async () => true);
        const physical = await service.openObservation(UID, PROJECT, "board");
        expect(physical.lanes.map(lane => lane.key)).to.deep.equal(["done", "todo"]);
        await physical.release();
    });

    it("recertifies after metadata resolution", async () => {
        await seed(server, "SELECT id, status FROM tasks");
        const reached = deferred(), release = deferred();
        const service = new OutlinerKanbanQueryService(server as never, async () => true, {
            beforeFinalCertification: async () => {
                reached.resolve();
                await release.promise;
            },
        });
        const pending = service.openObservation(UID, PROJECT, "board");
        await reached.promise;
        const connection = await server.openDirectConnection(`projects/${PROJECT}`);
        connection.document.getMap<Y.Map<unknown>>("yjsKanbans").get("board")!.set("titleField", "status");
        release.resolve();
        const observation = await pending;
        expect(observation).to.include({ status: "unavailable", reason: "stale_evidence" });
        expect(observation.routes).to.deep.equal([]);
    });

    it("uses the canonical all-day and timed outline materialization", async () => {
        await seed(server, "SELECT id, text AS status FROM outline_items WHERE start_on=DATE '2026-10-25'");
        const connection = await server.openDirectConnection(`projects/${PROJECT}`);
        const project = Project.fromDoc(connection.document as never);
        const page = project.addPage("Schedule", UID);
        const allDay = page.items.addNode(UID);
        allDay.updateText("all-day");
        allDay.yMap.set("start", "2026-10-25");
        allDay.yMap.set("allDay", true);
        const timed = page.items.addNode(UID);
        timed.updateText("timed");
        timed.yMap.set("start", "2026-10-25T09:00:00Z");
        timed.yMap.set("allDay", false);
        const service = new OutlinerKanbanQueryService(server as never, async () => true);
        const allDayResult = await service.openObservation(UID, PROJECT, "board");
        expect(allDayResult.lanes.map(lane => lane.key)).to.deep.equal(["all-day"]);
        await allDayResult.release();
        connection.document.getMap<Y.Map<unknown>>("yjsKanbans").get("board")!.set(
            "query",
            "SELECT id, text AS status FROM outline_items WHERE start_at IS NOT NULL",
        );
        const timedResult = await service.openObservation(UID, PROJECT, "board");
        expect(timedResult.lanes.map(lane => lane.key)).to.deep.equal(["timed"]);
        await timedResult.release();
    });

    it("requires row identity and source update policy for writable routes", async () => {
        await seed(server, "SELECT status FROM tasks", { rows: [{ id: "r1", status: "todo" }] });
        const observation = await new OutlinerKanbanQueryService(server as never, async () => true)
            .openObservation(UID, PROJECT, "board");
        expect(observation.routes).to.deep.include({
            output: "status",
            writable: false,
            reason: "unsupported_source_field",
        });
        await observation.release();
    });
});
