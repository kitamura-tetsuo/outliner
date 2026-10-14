import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { enqueueWrite, resetPgliteForTests } from "./pgliteService";
import { createProjectSelectSession, type ProjectSelectState } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

async function eventually(
    session: ReturnType<typeof createProjectSelectSession>,
    predicate: (state: ProjectSelectState) => boolean,
) {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate(session.state)) return session.state;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Session did not reach expected state: ${JSON.stringify(session.state)}`);
}

function holdPgliteQueue() {
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    const blocker = enqueueWrite(async () => await gate);
    return { release, blocker };
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Project SELECT session lifecycle", { timeout: 30_000 }, () => {
    it("requeries a no-Table outline_items SELECT after its Yjs source changes", async () => {
        const doc = new Y.Doc({ guid: "project-select-items" });
        const tree = Project.fromDoc(doc).tree;
        const page = new Items(doc, tree, "root").addNode("tester");
        page.text = "Tasks";
        const item = new Items(doc, tree, page.key).addNode("tester");
        item.text = "First";
        item.due = "2026-10-14T09:00:00Z";

        const session = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT text FROM outline_items ORDER BY text",
            connect: localConnector,
        });
        try {
            const first = await session.runNow();
            expect(first?.rows).toEqual([{ text: "First" }]);
            expect(first?.sources).toMatchObject([{ kind: "system", sqlName: "outline_items" }]);
            expect(doc.getMap("yjsTables").size).toBe(0);

            item.text = "Updated";
            const updated = await eventually(
                session,
                state => state.status === "success" && state.evidence.rows[0]?.text === "Updated",
            );
            expect(updated.status === "success" && updated.evidence.executionGeneration)
                .toBeGreaterThan(first!.executionGeneration);
        } finally {
            session.dispose();
        }
    });

    it("fences a held A completion across A-to-B-to-A and disposal", async () => {
        const doc = new Y.Doc({ guid: "project-select-stale-query" });
        const session = createProjectSelectSession({ projectDoc: doc, query: "SELECT 'A' AS value" });
        const initial = await session.runNow();
        const published: ProjectSelectState[] = [];
        session.subscribe(state => published.push(state));

        const held = holdPgliteQueue();
        const oldA = session.runNow();
        session.setQuery("SELECT 'B' AS value");
        session.setQuery("SELECT 'A' AS value");
        const newA = session.runNow();
        held.release();
        await held.blocker;

        await expect(oldA).resolves.toBeUndefined();
        const current = await newA;
        expect(current?.rows).toEqual([{ value: "A" }]);
        expect(current!.executionGeneration).toBeGreaterThan(initial!.executionGeneration);
        expect(published.filter(state => state.status === "success").at(-1))
            .toMatchObject({ status: "success", evidence: { queryId: current!.queryId } });

        const disposedHeld = holdPgliteQueue();
        const late = session.runNow();
        session.dispose();
        disposedHeld.release();
        await disposedHeld.blocker;
        await expect(late).resolves.toBeUndefined();
        expect(session.state).toEqual({ status: "disposed" });
    });

    it("fences a held completion when a used Table schema changes", async () => {
        const doc = new Y.Doc({ guid: "project-select-stale-schema" });
        const tableId = createTable(doc, "A", "a");
        const table = getTableHandles(doc, tableId)!;
        setSchemaText(table, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
        addRecord(table, { value: 1 }, "a1");
        const session = createProjectSelectSession({ projectDoc: doc, query: "SELECT value FROM a" });
        await session.runNow();

        const held = holdPgliteQueue();
        const stale = session.runNow();
        setSchemaText(table, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER, note TEXT)");
        held.release();
        await held.blocker;

        await expect(stale).resolves.toBeUndefined();
        const refreshed = await eventually(
            session,
            state =>
                state.status === "success"
                && state.evidence.sources[0]?.schemaRevision.includes("note TEXT"),
        );
        expect(refreshed.status).toBe("success");
        session.dispose();
    });
});
