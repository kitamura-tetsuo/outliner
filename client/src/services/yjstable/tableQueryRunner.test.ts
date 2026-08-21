// The Table's own raw-data browser (issue #5012): a Table must be viewable and
// editable without any persisted Grid, through an implicit
// `SELECT * FROM <sqlName>` that is derived, never stored.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { GRID_REGISTRY_KEY, listGrids } from "./gridDocs";
import { resetPgliteForTests } from "./pgliteService";
import {
    addRecord,
    createTable,
    deleteRecord,
    getTableHandles,
    setRecordValue,
    setSchemaText,
    setTableSqlName,
} from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
} from "./tableEngine";
import { rawTableQuery, RawTableQueryRunner } from "./tableQueryRunner";

/** Unit-test connector: the subdoc is already "synced" locally. */
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

function seedTasksTable(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tasksId = createTable(projectDoc, "Tasks", "tasks");
    const handles = getTableHandles(projectDoc, tasksId)!;
    setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)");
    addRecord(handles, { title: "Draft", status: "open" }, "t1");
    addRecord(handles, { title: "Ship", status: "open" }, "t2");
    return { projectDoc, tasksId, handles };
}

/** Give observers/microtasks a tick so any pending debounced work settles. */
function tick(ms = 250): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("rawTableQuery", () => {
    it("is the implicit SELECT * over the Table's SQL name", () => {
        expect(rawTableQuery("routine_occurrences")).toBe("SELECT * FROM routine_occurrences");
    });

    it("is empty when the Table has no SQL name yet", () => {
        expect(rawTableQuery("")).toBe("");
    });
});

describe("RawTableQueryRunner", { timeout: 30000 }, () => {
    it("returns every row and column of the Table, with no Grid in the project", async () => {
        const projectId = "proj-raw-browser";
        const { projectDoc, tasksId } = seedTasksTable(projectId);

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tasksId);
            const runner = new RawTableQueryRunner({
                sourceAdapter: acquired!.adapter,
                projectDoc,
                tableId: tasksId,
            });
            try {
                runner.start();
                const result = await runner.runQueryNow();

                expect(result?.columns.sort()).toEqual(["id", "status", "title"]);
                expect(result?.rows.map(r => r.id).sort()).toEqual(["t1", "t2"]);
                // The whole point: no Grid entity was needed or created.
                expect(listGrids(projectDoc)).toHaveLength(0);
                expect(projectDoc.getMap(GRID_REGISTRY_KEY).size).toBe(0);
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("persists no query or presentation state anywhere in the project doc", async () => {
        const projectId = "proj-raw-no-state";
        const { projectDoc, tasksId } = seedTasksTable(projectId);
        const before = Y.encodeStateAsUpdate(projectDoc);

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tasksId);
            const runner = new RawTableQueryRunner({
                sourceAdapter: acquired!.adapter,
                projectDoc,
                tableId: tasksId,
            });
            try {
                runner.start();
                await runner.runQueryNow();
                expect(Y.encodeStateAsUpdate(projectDoc)).toEqual(before);
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("writes made through Table write paths show up in the next run", async () => {
        const projectId = "proj-raw-editable";
        const { projectDoc, tasksId, handles } = seedTasksTable(projectId);

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tasksId);
            const runner = new RawTableQueryRunner({
                sourceAdapter: acquired!.adapter,
                projectDoc,
                tableId: tasksId,
            });
            try {
                runner.start();
                await runner.runQueryNow();

                // Exactly the write paths the raw grid's cells/add/delete use.
                setRecordValue(handles, "t1", "title", "Draft v2");
                addRecord(handles, { title: "Later", status: "open" }, "t3");
                deleteRecord(handles, "t2");
                await tick();

                const result = await runner.runQueryNow();
                const byId = new Map(result!.rows.map(r => [r.id, r]));
                expect([...byId.keys()].sort()).toEqual(["t1", "t3"]);
                expect(byId.get("t1")?.title).toBe("Draft v2");
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });

    it("follows a rename of the Table's SQL name instead of pinning the old one", async () => {
        const projectId = "proj-raw-rename";
        const { projectDoc, tasksId, handles } = seedTasksTable(projectId);

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tasksId);
            const runner = new RawTableQueryRunner({
                sourceAdapter: acquired!.adapter,
                projectDoc,
                tableId: tasksId,
            });
            try {
                runner.start();
                await runner.runQueryNow();

                setTableSqlName(projectDoc, tasksId, "todo_items");
                setSchemaText(
                    handles,
                    "CREATE TABLE todo_items (id TEXT PRIMARY KEY, title TEXT, status TEXT)",
                );
                await tick();

                const result = await runner.runQueryNow();
                expect(result?.rows.map(r => r.id).sort()).toEqual(["t1", "t2"]);
            } finally {
                runner.dispose();
            }
        } finally {
            session.dispose();
            await waitForTableEngineIdle();
        }
    });
});
