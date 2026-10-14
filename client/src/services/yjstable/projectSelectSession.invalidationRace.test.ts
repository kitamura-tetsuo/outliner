import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { enqueueWrite, resetPgliteForTests } from "./pgliteService";
import { createProjectSelectSession, type ProjectSelectState } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setRecordValue, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";

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

describe("Project SELECT dependency invalidation ordering", { timeout: 30_000 }, () => {
    it("fences a queued Table SELECT as soon as its Yjs record changes", async () => {
        const doc = new Y.Doc({ guid: "project-select-table-data-race" });
        const tableId = createTable(doc, "A", "a");
        const table = getTableHandles(doc, tableId)!;
        setSchemaText(table, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
        addRecord(table, { value: 1 }, "a1");
        const session = createProjectSelectSession({ projectDoc: doc, query: "SELECT value FROM a" });
        const previous = await session.runNow();

        const held = holdPgliteQueue();
        const stale = session.runNow();
        setRecordValue(table, "a1", "value", 2);
        expect(session.state).toMatchObject({ status: "loading", previous });
        held.release();
        await held.blocker;

        await expect(stale).resolves.toBeUndefined();
        const updated = await eventually(
            session,
            state => state.status === "success" && state.evidence.rows[0]?.value === 2,
        );
        expect(updated.status === "success" && updated.evidence.executionGeneration)
            .toBeGreaterThan(previous!.executionGeneration);
        session.dispose();
    });

    it("fences a queued outline_items SELECT before its projection flush", async () => {
        const doc = new Y.Doc({ guid: "project-select-items-data-race" });
        const tree = Project.fromDoc(doc).tree;
        const page = new Items(doc, tree, "root").addNode("tester");
        const item = new Items(doc, tree, page.key).addNode("tester");
        item.text = "Before";
        item.due = "2026-10-14T09:00:00Z";
        const session = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT text FROM outline_items",
        });
        const previous = await session.runNow();

        const held = holdPgliteQueue();
        const stale = session.runNow();
        item.text = "After";
        expect(session.state).toMatchObject({ status: "loading", previous });
        held.release();
        await held.blocker;

        await expect(stale).resolves.toBeUndefined();
        const updated = await eventually(
            session,
            state => state.status === "success" && state.evidence.rows[0]?.text === "After",
        );
        expect(updated.status === "success" && updated.evidence.executionGeneration)
            .toBeGreaterThan(previous!.executionGeneration);
        session.dispose();
    });
});
