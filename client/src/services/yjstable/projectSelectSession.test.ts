import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "./pgliteService";
import { createProjectSelectSession, type ProjectSelectState } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setRecordValue, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

function project(id: string) {
    const doc = new Y.Doc({ guid: id });
    const aId = createTable(doc, "A", "a");
    const a = getTableHandles(doc, aId)!;
    setSchemaText(a, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
    addRecord(a, { value: 1 }, "a1");
    const bId = createTable(doc, "B", "b");
    const b = getTableHandles(doc, bId)!;
    setSchemaText(b, "CREATE TABLE b (id TEXT PRIMARY KEY, value INTEGER)");
    addRecord(b, { value: 2 }, "b1");
    return { doc, a, b };
}

async function eventually(
    session: ReturnType<typeof createProjectSelectSession>,
    predicate: (s: ProjectSelectState) => boolean,
) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate(session.state)) return session.state;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Session did not reach expected state: ${JSON.stringify(session.state)}`);
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Project SELECT session", { timeout: 30_000 }, () => {
    it("runs constants and successful zero-row SELECTs without creating a primary Table", async () => {
        const doc = new Y.Doc({ guid: "project-select-constant" });
        const session = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT 42 AS answer",
            connect: localConnector,
        });
        try {
            const constant = await session.runNow();
            expect(constant?.rows).toEqual([{ answer: 42 }]);
            expect(constant?.sources).toEqual([]);
            expect(constant?.columns).toEqual([{ name: "answer", typeId: 23 }]);
            expect(doc.getMap("yjsTables").size).toBe(0);

            session.setQuery("SELECT 42 AS answer WHERE false");
            const empty = await session.runNow();
            expect(empty?.rows).toEqual([]);
            expect(empty?.columns).toEqual([{ name: "answer", typeId: 23 }]);
            expect(session.state.status).toBe("success");
        } finally {
            session.dispose();
        }
    });

    it("resolves every UNION/EXISTS source and reacts to warm provider data", async () => {
        const { doc, a, b } = project("project-select-relations");
        const warming = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT * FROM a",
            connect: localConnector,
        });
        await warming.runNow();
        const session = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT value FROM a UNION ALL SELECT value FROM b WHERE EXISTS (SELECT 1 FROM a)",
            connect: localConnector,
        });
        try {
            const first = await session.runNow();
            expect(first?.rows).toEqual([{ value: 1 }, { value: 2 }]);
            expect(first?.sources.map(source => [source.kind, source.sqlName])).toEqual([
                ["table", "a"],
                ["table", "b"],
            ]);
            warming.dispose();
            setRecordValue(b, "b1", "value", 9);
            const updated = await eventually(
                session,
                state => state.status === "success" && state.evidence.rows.some(row => row.value === 9),
            );
            expect(updated.status === "success" && updated.evidence.executionGeneration).toBeGreaterThan(
                first!.executionGeneration,
            );
        } finally {
            session.dispose();
            warming.dispose();
        }
    });

    it("keeps stale evidence noncurrent and reconstructs from Project state", async () => {
        const { doc } = project("project-select-reconstruct");
        const first = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT value FROM b",
            connect: localConnector,
        });
        const evidence = await first.runNow();
        first.setQuery("");
        expect(first.state).toMatchObject({ status: "loading", previous: evidence });
        await first.runNow();
        expect(first.state).toMatchObject({ status: "incomplete", previous: evidence });
        first.dispose();

        const restored = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT value FROM b",
            connect: localConnector,
        });
        try {
            expect(restored.state.status).toBe("loading");
            expect((await restored.runNow())?.rows).toEqual([{ value: 2 }]);
        } finally {
            restored.dispose();
        }
    });

    it("distinguishes unavailable and invalid SQL from successful empty results", async () => {
        const doc = new Y.Doc({ guid: "project-select-errors" });
        const session = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT * FROM missing",
            connect: localConnector,
        });
        try {
            await session.runNow();
            expect(session.state).toMatchObject({ status: "unavailable", relation: "missing" });
            session.setQuery("SELECT definitely broken");
            await session.runNow();
            expect(session.state).toMatchObject({ status: "error", kind: "sql" });
        } finally {
            session.dispose();
        }
    });
});
