import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { KanbanCardOperationController } from "./kanbanCardOperations";
import { createKanban, getKanban, getKanbanHandles, updateKanban } from "./kanbanDocs";
import { type KanbanProjection, KanbanQueryRunner } from "./kanbanQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { type RelationProvider, type RelationWrite, RelationWriteError } from "./relationProvider";
import type { RelationResolver } from "./relationRowWrite";
import { addRecord, createTable, getTableHandles, removeTable, setRecordValue, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const SCHEMA =
    "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT CHECK (status IN ('', 'todo', 'done')) )";
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose() {},
});
const delay = () => new Promise(resolve => setTimeout(resolve, 250));

async function fixture(query = "SELECT id, title, status FROM tasks ORDER BY title") {
    const projectDoc = new Y.Doc({ guid: `kanban-write-${crypto.randomUUID()}` });
    const tableId = createTable(projectDoc, "Tasks", "tasks");
    const table = getTableHandles(projectDoc, tableId)!;
    setSchemaText(table, SCHEMA);
    addRecord(table, { title: "Beta", status: "todo" }, "one");
    addRecord(table, { title: "Alpha", status: "" }, "two");
    addRecord(table, { title: "Null lane", status: null }, "three");
    const otherId = createTable(projectDoc, "Other", "other_tasks");
    const other = getTableHandles(projectDoc, otherId)!;
    setSchemaText(other, SCHEMA.replace("tasks", "other_tasks"));
    addRecord(other, { title: "Union", status: "todo" }, "one");
    const kanbanId = createKanban(projectDoc, tableId, { query, groupField: "status", titleField: "title" });
    const session = createTableEngineSession({ projectDoc, projectId: projectDoc.guid, connect: localConnector });
    const runner = new KanbanQueryRunner({
        projectDoc,
        kanbanId,
        kanban: getKanbanHandles(projectDoc, kanbanId)!,
        connect: localConnector,
    });
    let projection: KanbanProjection = { status: "loading", current: false, lanes: [], columns: [] };
    runner.subscribeProjection(value => projection = value);
    runner.start();
    await delay();
    await runner.runQueryNow();
    const refresh = async () => {
        await delay();
        await runner.runQueryNow();
        return projection;
    };
    const controller = (resolver: RelationResolver = session) =>
        new KanbanCardOperationController({
            resolver,
            schema: sourceKind => runner.schemaForSource(sourceKind),
            settings: () => getKanban(projectDoc, kanbanId),
            projection: () => projection,
            canWrite: () => true,
            beginHistoryAction: () => globalUndoRouter.stopCapturing(),
        });
    return {
        projectDoc,
        tableId,
        table,
        other,
        kanbanId,
        session,
        runner,
        controller,
        refresh,
        get projection() {
            return projection;
        },
    };
}

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("Kanban card operations from saved SELECT execution", { timeout: 30000 }, () => {
    it("routes source-identified UNION occurrences to their actual provider", async () => {
        const c = await fixture(
            "SELECT 'tasks' AS source_kind, id AS source_id, title, status FROM tasks UNION ALL SELECT 'other_tasks', id, title, status FROM other_tasks ORDER BY title",
        );
        const card = c.projection.lanes.flatMap(l => l.cards).find(v => v.sourceIdentity?.kind === "other_tasks")!;
        expect(c.controller().begin(card, "title")).toBe(true);
        await expect(c.controller().commit("wrong controller")).resolves.toMatchObject({ ok: false });
        const operation = c.controller();
        expect(operation.begin(card, "title")).toBe(true);
        await expect(operation.commit("Edited union")).resolves.toMatchObject({ ok: true });
        expect(c.other.data.get("one")?.get("title")).toBe("Edited union");
        expect(c.table.data.get("one")?.get("title")).toBe("Beta");
        c.runner.dispose();
        c.session.dispose();
    });

    it("validates UNION lane moves against the selected supplier schema", async () => {
        const c = await fixture(
            "SELECT 'tasks' AS source_kind, id AS source_id, title, status FROM tasks UNION ALL SELECT 'other_tasks', id, title, status FROM other_tasks ORDER BY title",
        );
        setSchemaText(
            c.table,
            "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT CHECK (status IN ('open', 'done')))",
        );
        setSchemaText(
            c.other,
            "CREATE TABLE other_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT CHECK (status IN ('todo', 'blocked')))",
        );
        setRecordValue(c.table, "one", "status", "open");
        addRecord(c.other, { title: "Blocked", status: "blocked" }, "blocked");
        await c.refresh();

        const bCard = c.projection.lanes.find(lane => lane.key === "todo")!.cards
            .find(card => card.sourceIdentity?.kind === "other_tasks")!;
        const operation = c.controller();
        const historyDepth = c.other.undo.undoStack.length;
        expect(operation.begin(bCard, "status", "open")).toBe(true);
        await expect(operation.commit("open")).resolves.toMatchObject({ ok: false, state: "refused" });
        expect(c.table.data.get("one")?.get("status")).toBe("open");
        expect(c.other.data.get("one")?.get("status")).toBe("todo");
        expect(c.other.undo.undoStack).toHaveLength(historyDepth);

        const allowed = c.controller();
        expect(allowed.begin(bCard, "status", "blocked")).toBe(true);
        await expect(allowed.commit("blocked")).resolves.toMatchObject({ ok: true });
        expect(c.other.data.get("one")?.get("status")).toBe("blocked");
        c.runner.dispose();
        c.session.dispose();
    });

    it("permanently invalidates an edit when its supplier is replaced under the same SQL name", async () => {
        const c = await fixture();
        globalUndoRouter.clear();
        const card = c.projection.lanes.find(lane => lane.key === "todo")!.cards[0];
        const oldSupplierId = card.sourceIdentity?.supplierId;
        const stale = c.controller();
        expect(stale.begin(card, "title")).toBe(true);

        expect(removeTable(c.projectDoc, c.tableId)).toBe(true);
        const replacementId = createTable(c.projectDoc, "Replacement", "tasks");
        const replacement = getTableHandles(c.projectDoc, replacementId)!;
        setSchemaText(replacement, SCHEMA);
        addRecord(replacement, { title: "Beta", status: "todo" }, "one");
        await c.refresh();
        const replacementCard = c.projection.lanes.find(lane => lane.key === "todo")!.cards[0];
        expect(replacementCard.sourceIdentity?.supplierId).toBe(replacementId);
        expect(replacementCard.sourceIdentity?.supplierId).not.toBe(oldSupplierId);
        const historyDepth = replacement.undo.undoStack.length;

        await expect(stale.commit("Stale draft")).resolves.toMatchObject({ ok: false, state: "refused" });
        expect(replacement.data.get("one")?.get("title")).toBe("Beta");
        expect(replacement.undo.undoStack).toHaveLength(historyDepth);

        const current = c.controller();
        expect(current.begin(replacementCard, "title")).toBe(true);
        await expect(current.commit("Current draft")).resolves.toMatchObject({ ok: true });
        expect(replacement.data.get("one")?.get("title")).toBe("Current draft");
        c.runner.dispose();
        c.session.dispose();
    });

    it("refuses a forged UNION kind that collides with another branch", async () => {
        const c = await fixture(
            "SELECT 'other_tasks' AS source_kind, id AS source_id, title, status FROM tasks UNION ALL SELECT 'other_tasks', id, title, status FROM other_tasks ORDER BY title",
        );
        const forged = c.projection.lanes.flatMap(lane => lane.cards).find(card => card.row.title === "Beta")!;
        expect(forged.sourceIdentity).toBeUndefined();
        expect(c.controller().begin(forged, "title")).toBe(false);
        expect(c.table.data.get("one")?.get("title")).toBe("Beta");
        expect(c.other.data.get("one")?.get("title")).toBe("Union");
        c.runner.dispose();
        c.session.dispose();
    });

    it("refuses a computed UNION kind that borrows another branch proof", async () => {
        const c = await fixture(
            "SELECT ('other_' || 'tasks') AS source_kind, id AS source_id, title, status FROM tasks UNION ALL SELECT 'other_tasks', id, title, status FROM other_tasks ORDER BY title",
        );
        const forged = c.projection.lanes.flatMap(lane => lane.cards).find(card => card.row.title === "Beta")!;
        expect(forged.sourceIdentity).toBeUndefined();
        const operation = c.controller();
        expect(operation.begin(forged, "status")).toBe(false);
        await expect(operation.commit("done")).resolves.toMatchObject({ ok: false });
        expect(c.table.data.get("one")?.get("status")).toBe("todo");
        expect(c.other.data.get("one")?.get("status")).toBe("todo");
        c.runner.dispose();
        c.session.dispose();
    });

    it("refuses readonly saved-SELECT families", async () => {
        const c = await fixture();
        for (
            const query of [
                "SELECT tasks.id, tasks.title, tasks.status FROM tasks JOIN other_tasks ON true",
                "SELECT id, max(title) AS title, status FROM tasks GROUP BY id, status",
                "SELECT DISTINCT id, title, status FROM tasks",
                "SELECT id, upper(title) AS title, status FROM tasks",
            ]
        ) {
            updateKanban(c.projectDoc, c.kanbanId, { query });
            await c.refresh();
            const card = c.projection.lanes.flatMap(l => l.cards)[0];
            if (card) {
                const op = c.controller();
                if (op.begin(card, "title")) await expect(op.commit("Denied")).resolves.toMatchObject({ ok: false });
            }
            expect(c.table.data.get("one")?.get("title")).toBe("Beta");
        }
        c.runner.dispose();
        c.session.dispose();
    });

    it("routes a bare id to the actual supplier instead of the legacy primary Table", async () => {
        const c = await fixture("SELECT id, title, status FROM other_tasks");
        const card = c.projection.lanes.flatMap(lane => lane.cards)[0]!;
        const operation = c.controller();

        expect(operation.begin(card, "title")).toBe(true);
        await expect(operation.commit("Edited actual source")).resolves.toMatchObject({ ok: true });
        expect(c.other.data.get("one")?.get("title")).toBe("Edited actual source");
        expect(c.table.data.get("one")?.get("title")).toBe("Beta");
        c.runner.dispose();
        c.session.dispose();
    });

    it("writes NULL and empty lane keys exactly and Undo/Redo changes only that field", async () => {
        const c = await fixture();
        const card = c.projection.lanes.find(l => l.key === "todo")!.cards[0];
        let op = c.controller();
        expect(op.begin(card, "status")).toBe(true);
        expect(op.chooseDestination("")).toBe(true);
        await expect(op.commit("")).resolves.toMatchObject({ ok: true });
        expect(c.table.data.get("one")?.toJSON()).toEqual({ id: "one", title: "Beta", status: "" });
        globalUndoRouter.undo();
        expect(c.table.data.get("one")?.get("status")).toBe("todo");
        globalUndoRouter.redo();
        expect(c.table.data.get("one")?.get("status")).toBe("");
        setRecordValue(c.table, "one", "status", "todo");
        await c.refresh();
        op = c.controller();
        expect(op.begin(c.projection.lanes.find(l => l.key === "todo")!.cards[0], "status", null)).toBe(true);
        await expect(op.commit(null)).resolves.toMatchObject({ ok: true });
        expect(c.table.data.get("one")?.get("status")).toBeNull();
        c.runner.dispose();
        c.session.dispose();
    });

    it("captures consecutive card writes as separate Table history actions", async () => {
        const c = await fixture();
        globalUndoRouter.clear();
        let card = c.projection.lanes.find(lane => lane.key === "todo")!.cards[0];
        const title = c.controller();
        expect(title.begin(card, "title")).toBe(true);
        await expect(title.commit("Beta edited")).resolves.toMatchObject({ ok: true });
        await c.refresh();

        card = c.projection.lanes.find(lane => lane.key === "todo")!.cards[0];
        const move = c.controller();
        expect(move.begin(card, "status", "done")).toBe(true);
        await expect(move.commit("done")).resolves.toMatchObject({ ok: true });
        expect(c.table.data.get("one")?.toJSON()).toMatchObject({ title: "Beta edited", status: "done" });

        globalUndoRouter.undo();
        expect(c.table.data.get("one")?.toJSON()).toMatchObject({ title: "Beta edited", status: "todo" });
        globalUndoRouter.redo();
        expect(c.table.data.get("one")?.toJSON()).toMatchObject({ title: "Beta edited", status: "done" });
        c.runner.dispose();
        c.session.dispose();
    });

    it("observes a held real-provider boundary and blocks stale intent", async () => {
        const c = await fixture();
        let release!: () => void;
        let observed!: () => void;
        const held = new Promise<void>(resolve => release = resolve);
        const reached = new Promise<void>(resolve => observed = resolve);
        const resolver: RelationResolver = {
            resolveRelation: async name => {
                const provider = await c.session.resolveRelation(name);
                observed();
                await held;
                return provider;
            },
        };
        const op = c.controller(resolver);
        const card = c.projection.lanes.find(l => l.key === "todo")!.cards[0];
        expect(op.begin(card, "title")).toBe(true);
        const pending = op.commit("Stale");
        await reached;
        setRecordValue(c.table, "one", "title", "Peer");
        await c.refresh();
        release();
        await expect(pending).resolves.toMatchObject({ ok: false });
        expect(c.table.data.get("one")?.get("title")).toBe("Peer");
        c.runner.dispose();
        c.session.dispose();
    });

    it("permanently cancels a held write after observing a field A-to-B-to-A cycle", async () => {
        const c = await fixture();
        globalUndoRouter.clear();
        let release!: () => void;
        let observed!: () => void;
        const held = new Promise<void>(resolve => release = resolve);
        const reached = new Promise<void>(resolve => observed = resolve);
        const resolver: RelationResolver = {
            resolveRelation: async name => {
                const provider = await c.session.resolveRelation(name);
                observed();
                await held;
                return provider;
            },
        };
        const op = c.controller(resolver);
        const card = c.projection.lanes.find(lane => lane.key === "todo")!.cards[0];
        expect(op.begin(card, "title")).toBe(true);
        const pending = op.commit("Stale draft");
        await reached;

        setRecordValue(c.table, "one", "title", "Peer B");
        setRecordValue(c.table, "one", "title", "Beta");
        const historyDepth = c.table.undo.undoStack.length;
        release();

        await expect(pending).resolves.toMatchObject({ ok: false, state: "refused" });
        expect(c.table.data.get("one")?.get("title")).toBe("Beta");
        expect(c.table.undo.undoStack).toHaveLength(historyDepth);
        c.runner.dispose();
        c.session.dispose();
    });

    it("permanently cancels a held write after the source schema changes", async () => {
        const c = await fixture();
        globalUndoRouter.clear();
        let release!: () => void;
        let observed!: () => void;
        const held = new Promise<void>(resolve => release = resolve);
        const reached = new Promise<void>(resolve => observed = resolve);
        const resolver: RelationResolver = {
            resolveRelation: async name => {
                const provider = await c.session.resolveRelation(name);
                observed();
                await held;
                return provider;
            },
        };
        const op = c.controller(resolver);
        const card = c.projection.lanes.find(lane => lane.key === "todo")!.cards[0];
        expect(op.begin(card, "title")).toBe(true);
        const pending = op.commit("Stale draft");
        await reached;

        setSchemaText(
            c.table,
            "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT CHECK (status IN ('', 'todo', 'done')), note TEXT)",
        );
        await c.refresh();
        const historyDepth = c.table.undo.undoStack.length;
        release();

        await expect(pending).resolves.toMatchObject({ ok: false });
        expect(c.table.data.get("one")?.get("title")).toBe("Beta");
        expect(c.table.undo.undoStack).toHaveLength(historyDepth);
        c.runner.dispose();
        c.session.dispose();
    });

    it("allows a held write after an unrelated peer field changes", async () => {
        const c = await fixture();
        let release!: () => void;
        let observed!: () => void;
        const held = new Promise<void>(resolve => release = resolve);
        const reached = new Promise<void>(resolve => observed = resolve);
        const resolver: RelationResolver = {
            resolveRelation: async name => {
                const provider = await c.session.resolveRelation(name);
                observed();
                await held;
                return provider;
            },
        };
        const op = c.controller(resolver);
        const card = c.projection.lanes.find(lane => lane.key === "todo")!.cards[0];
        expect(op.begin(card, "title")).toBe(true);
        const pending = op.commit("Current draft");
        await reached;

        setRecordValue(c.table, "one", "status", "done");
        op.observeProjection(await c.refresh());
        release();

        await expect(pending).resolves.toMatchObject({ ok: true });
        expect(c.table.data.get("one")?.toJSON()).toMatchObject({ title: "Current draft", status: "done" });
        c.runner.dispose();
        c.session.dispose();
    });

    it("refuses incomplete, unknown, missing-row, and non-updatable source identities", async () => {
        for (
            const query of [
                "SELECT 'tasks' AS source_kind, title, status FROM tasks",
                "SELECT id AS source_id, title, status FROM tasks",
            ]
        ) {
            const incomplete = await fixture(query);
            const card = incomplete.projection.lanes.flatMap(lane => lane.cards)[0];
            expect(card && incomplete.controller().begin(card, "title")).toBeFalsy();
            incomplete.runner.dispose();
            incomplete.session.dispose();
        }

        const c = await fixture(
            "SELECT 'tasks' AS source_kind, id AS source_id, title, status FROM tasks ORDER BY title",
        );
        const card = c.projection.lanes.flatMap(lane => lane.cards)[0];
        const unknown = c.controller({ resolveRelation: async () => undefined });
        expect(unknown.begin(card, "title")).toBe(true);
        await expect(unknown.commit("Unknown")).resolves.toMatchObject({ ok: false, state: "error" });

        const realProvider = await c.session.resolveRelation("tasks");
        const readonly: RelationProvider = {
            sqlName: realProvider!.sqlName,
            evidence: realProvider!.evidence,
            capabilities: { update: false },
            materialize: () => realProvider!.materialize(),
            applyWrite: async () => {
                throw new RelationWriteError("Relation does not accept UPDATE");
            },
            dispose() {},
        };
        const denied = c.controller({ resolveRelation: async () => readonly });
        expect(denied.begin(card, "title")).toBe(true);
        await expect(denied.commit("Denied")).resolves.toMatchObject({ ok: false, state: "error" });

        const removed = c.controller();
        expect(removed.begin(card, "title")).toBe(true);
        c.table.data.delete(card.sourceIdentity!.id);
        await c.refresh();
        await expect(removed.commit("Missing")).resolves.toMatchObject({ ok: false });
        expect(Array.from(c.table.data.values(), row => row.get("title"))).not.toContain("Missing");
        c.runner.dispose();
        c.session.dispose();
    });

    it("updates one source row for duplicate occurrences and preserves SQL-derived order and membership", async () => {
        const c = await fixture(
            "SELECT 'tasks' AS source_kind, id AS source_id, title, status FROM tasks "
                + "UNION ALL SELECT 'tasks', id, title, status FROM tasks ORDER BY title DESC",
        );
        const occurrences = c.projection.lanes.flatMap(lane => lane.cards).filter(card =>
            card.sourceIdentity?.id === "one"
        );
        expect(occurrences).toHaveLength(2);
        let writes = 0;
        const resolver: RelationResolver = {
            resolveRelation: async name => {
                const provider = await c.session.resolveRelation(name);
                if (!provider) return undefined;
                return {
                    sqlName: provider.sqlName,
                    evidence: provider.evidence,
                    capabilities: provider.capabilities,
                    materialize: () => provider.materialize(),
                    existingRowWriteRevision: (rowId, column) =>
                        provider.existingRowWriteRevision?.(rowId, column) ?? "",
                    applyWrite: async (write: RelationWrite) => {
                        writes++;
                        await provider.applyWrite(write);
                    },
                    dispose() {},
                };
            },
        };
        const operation = c.controller(resolver);
        expect(operation.begin(occurrences[0], "status", "")).toBe(true);
        await expect(operation.commit("")).resolves.toMatchObject({ ok: true });
        expect(writes).toBe(1);
        await c.refresh();
        expect(c.projection.lanes.find(lane => lane.key === "")!.cards.map(card => card.row.title)).toEqual([
            "Beta",
            "Beta",
            "Alpha",
            "Alpha",
        ]);

        updateKanban(c.projectDoc, c.kanbanId, {
            query: "SELECT id, title, status FROM tasks WHERE status = 'todo' ORDER BY title DESC LIMIT 1",
        });
        setRecordValue(c.table, "one", "status", "todo");
        await c.refresh();
        const visible = c.projection.lanes.flatMap(lane => lane.cards).find(card => card.sourceIdentity?.id === "one")!;
        const move = c.controller();
        expect(move.begin(visible, "status", "done")).toBe(true);
        await expect(move.commit("done")).resolves.toMatchObject({ ok: true });
        await c.refresh();
        expect(c.projection.lanes.flatMap(lane => lane.cards)).toEqual([]);
        c.runner.dispose();
        c.session.dispose();
    });

    it("refuses duplicate source occurrences with conflicting physical column routes", async () => {
        const schema = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, status TEXT)";
        const c = await fixture(
            "SELECT 'tasks' AS source_kind, id AS source_id, title AS shown, 'first' AS lane FROM tasks "
                + "UNION ALL SELECT 'tasks', id, description, 'second' FROM tasks",
        );
        setSchemaText(c.table, schema);
        setRecordValue(c.table, "one", "description", "Beta");
        updateKanban(c.projectDoc, c.kanbanId, { groupField: "lane", titleField: "shown" });
        await c.refresh();
        globalUndoRouter.clear();

        const secondOccurrence = c.projection.lanes.find(lane => lane.key === "second")!.cards.find(card =>
            card.sourceIdentity?.id === "one"
        )!;
        const operation = c.controller();
        expect(operation.begin(secondOccurrence, "shown")).toBe(false);
        await expect(operation.commit("changed")).resolves.toMatchObject({ ok: false, state: "refused" });
        expect(c.table.data.get("one")?.toJSON()).toMatchObject({ title: "Beta", description: "Beta" });
        globalUndoRouter.undo();
        expect(c.table.data.get("one")?.toJSON()).toMatchObject({ title: "Beta", description: "Beta" });
        c.runner.dispose();
        c.session.dispose();
    });

    it("keeps SQL NULL, empty text, and the literal NULL label as distinct production lanes", async () => {
        const c = await fixture();
        setSchemaText(
            c.table,
            "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT)",
        );
        addRecord(c.table, { title: "Literal label", status: "NULL" }, "four");
        await c.refresh();
        expect(c.projection.lanes.map(lane => lane.key)).toEqual(expect.arrayContaining([null, "", "NULL", "todo"]));

        const todo = c.projection.lanes.find(lane => lane.key === "todo")!.cards[0];
        const unchanged = c.controller();
        expect(unchanged.begin(todo, "status", "todo")).toBe(true);
        await expect(unchanged.commit("todo")).resolves.toMatchObject({ ok: false, state: "refused" });
        expect(c.table.data.get("one")?.get("status")).toBe("todo");

        for (const destination of [null, "", "NULL"] as const) {
            await c.refresh();
            const current = c.projection.lanes.flatMap(lane => lane.cards).find(card =>
                card.sourceIdentity?.id === "one"
            )!;
            const operation = c.controller();
            expect(operation.begin(current, "status", destination)).toBe(true);
            await expect(operation.commit(destination)).resolves.toMatchObject({ ok: true });
            expect(c.table.data.get("one")?.get("status")).toBe(destination);
            await c.refresh();
            expect(c.projection.lanes.some(lane => lane.key === "todo")).toBe(false);
        }
        c.runner.dispose();
        c.session.dispose();
    });
});
