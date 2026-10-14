import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "./pgliteService";
import { createProjectSelectSession, type ProjectSelectState } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, removeTable, setRecordValue, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector, waitForTableEngineIdle } from "./tableEngine";

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

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Project SELECT source replacement", { timeout: 30_000 }, () => {
    for (const replacementWarm of [false, true]) {
        it(`adopts a ${replacementWarm ? "warm" : "cold"} replacement with the same SQL name`, async () => {
            const doc = new Y.Doc({ guid: `project-select-replacement-${replacementWarm}` });
            const oldId = createTable(doc, "Old A", "a");
            const oldTable = getTableHandles(doc, oldId)!;
            setSchemaText(oldTable, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
            addRecord(oldTable, { value: 1 }, "old");
            const session = createProjectSelectSession({
                projectDoc: doc,
                query: "SELECT value FROM a",
                connect: localConnector,
            });
            let warming: ReturnType<typeof createProjectSelectSession> | undefined;
            try {
                expect((await session.runNow())?.sources[0]?.id).toBe(oldId);
                expect(removeTable(doc, oldId)).toBe(true);
                await waitForTableEngineIdle();

                const replacementId = createTable(doc, "New A", "a");
                const replacement = getTableHandles(doc, replacementId)!;
                setSchemaText(replacement, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
                addRecord(replacement, { value: 2 }, "new");
                if (replacementWarm) {
                    warming = createProjectSelectSession({
                        projectDoc: doc,
                        query: "SELECT value FROM a",
                        connect: localConnector,
                    });
                    await warming.runNow();
                }

                const adopted = await eventually(
                    session,
                    state => state.status === "success" && state.evidence.sources[0]?.id === replacementId,
                );
                expect(adopted.status === "success" && adopted.evidence.rows).toEqual([{ value: 2 }]);
                const generation = adopted.status === "success" ? adopted.evidence.executionGeneration : 0;

                setRecordValue(replacement, "new", "value", 3);
                const updated = await eventually(
                    session,
                    state =>
                        state.status === "success"
                        && state.evidence.executionGeneration > generation
                        && state.evidence.rows[0]?.value === 3,
                );
                expect(updated.status === "success" && updated.evidence.sources[0]?.id).toBe(replacementId);
            } finally {
                warming?.dispose();
                session.dispose();
            }
        });
    }

    it("does not publish the old physical table after its source schema becomes invalid", async () => {
        const doc = new Y.Doc({ guid: "project-select-invalid-source" });
        const tableId = createTable(doc, "A", "a");
        const table = getTableHandles(doc, tableId)!;
        setSchemaText(table, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
        addRecord(table, { value: 1 }, "a1");
        const session = createProjectSelectSession({ projectDoc: doc, query: "SELECT value FROM a" });
        try {
            const previous = await session.runNow();
            setSchemaText(table, "CREATE TABLE a (");
            await eventually(session, state => state.status === "error");

            await expect(session.runNow()).resolves.toBeUndefined();
            expect(session.state).toMatchObject({ status: "error", previous });
            expect(session.state.status).not.toBe("success");
        } finally {
            session.dispose();
        }
    });
});
