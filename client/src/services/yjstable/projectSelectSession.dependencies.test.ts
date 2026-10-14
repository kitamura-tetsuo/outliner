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

async function eventually(
    session: ReturnType<typeof createProjectSelectSession>,
    predicate: (state: ProjectSelectState) => boolean,
) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate(session.state)) return session.state;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Session did not reach expected state: ${JSON.stringify(session.state)}`);
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Project SELECT relation dependencies", { timeout: 30_000 }, () => {
    it("retains and observes every warm comma-joined relation", async () => {
        const doc = new Y.Doc({ guid: "project-select-comma-dependencies" });
        const aId = createTable(doc, "A", "a");
        const a = getTableHandles(doc, aId)!;
        setSchemaText(a, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
        addRecord(a, { value: 1 }, "a1");
        const bId = createTable(doc, "B", "b");
        const b = getTableHandles(doc, bId)!;
        setSchemaText(b, "CREATE TABLE b (id TEXT PRIMARY KEY, value INTEGER)");
        addRecord(b, { value: 2 }, "b1");

        const warming = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT * FROM a UNION ALL SELECT * FROM b",
            connect: localConnector,
        });
        await warming.runNow();
        const session = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT a.value FROM a, b",
            connect: localConnector,
        });
        try {
            const first = await session.runNow();
            expect(first?.rows).toEqual([{ value: 1 }]);
            expect(first?.sources.map(source => source.sqlName)).toEqual(["a", "b"]);

            setRecordValue(b, "b1", "value", 9);
            const refreshed = await eventually(
                session,
                state =>
                    state.status === "success"
                    && state.evidence.executionGeneration > first!.executionGeneration,
            );
            expect(refreshed.status === "success" && refreshed.evidence.sources.map(source => source.sqlName))
                .toEqual(["a", "b"]);
        } finally {
            session.dispose();
            warming.dispose();
        }
    });
});
