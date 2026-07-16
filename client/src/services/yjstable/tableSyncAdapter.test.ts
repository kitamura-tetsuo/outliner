import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, deleteRecord, getTableHandles, setRecordValue, setSchemaText } from "./tableDocs";
import { type RecordSyncError, TableSyncAdapter } from "./tableSyncAdapter";

const SCHEMA = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, points INTEGER, "
    + "status TEXT CHECK (status IN ('open', 'done')))";

function makeTable() {
    const projectDoc = new Y.Doc();
    const tableId = createTable(projectDoc, "Tasks");
    const handles = getTableHandles(projectDoc, tableId)!;
    return { projectDoc, handles };
}

function waitMicrotasks(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost, which can exceed the default
// 5s timeout when the whole unit suite runs in parallel workers.
describe("TableSyncAdapter", { timeout: 30000 }, () => {
    it("loads existing records on start and serves the UI query", async () => {
        const { handles } = makeTable();
        setSchemaText(handles, SCHEMA);
        handles.uiDef.set("query", "SELECT id, title, points FROM tasks ORDER BY title");
        addRecord(handles, { title: "b task", points: 2, status: "open" });
        addRecord(handles, { title: "a task", points: 1, status: "done" });

        const adapter = new TableSyncAdapter(handles);
        try {
            await adapter.start();
            const result = await adapter.runQueryNow();
            expect(result?.columns).toEqual(["id", "title", "points"]);
            expect(result?.rows.map((r) => r.title)).toEqual(["a task", "b task"]);
        } finally {
            adapter.dispose();
        }
    });

    it("syncs incremental record changes (insert, update, delete)", async () => {
        const { handles } = makeTable();
        setSchemaText(handles, SCHEMA);
        handles.uiDef.set("query", "SELECT id, title, points FROM tasks");
        const adapter = new TableSyncAdapter(handles);
        try {
            await adapter.start();

            const recordId = addRecord(handles, { title: "task", points: 1, status: "open" });
            await waitMicrotasks();
            let result = await adapter.runQueryNow();
            expect(result?.rows).toHaveLength(1);

            setRecordValue(handles, recordId, "points", 5);
            await waitMicrotasks();
            result = await adapter.runQueryNow();
            expect(result?.rows[0].points).toBe(5);

            deleteRecord(handles, recordId);
            await waitMicrotasks();
            result = await adapter.runQueryNow();
            expect(result?.rows).toHaveLength(0);
        } finally {
            adapter.dispose();
        }
    });

    it("collects cast errors per record and keeps other records syncing", async () => {
        const { handles } = makeTable();
        setSchemaText(handles, SCHEMA);
        handles.uiDef.set("query", "SELECT id, title FROM tasks");
        let errors: RecordSyncError[] = [];
        const adapter = new TableSyncAdapter(handles, {
            onRecordErrors: (e) => {
                errors = e;
            },
        });
        try {
            await adapter.start();
            const badId = addRecord(handles, { title: "bad", points: "not-a-number" });
            addRecord(handles, { title: "good", points: 3 });
            await waitMicrotasks();
            await adapter.runQueryNow();

            expect(errors).toHaveLength(1);
            expect(errors[0].recordId).toBe(badId);
            expect(errors[0].column).toBe("points");
            const result = await adapter.runQueryNow();
            expect(result?.rows.map((r) => r.title)).toEqual(["good"]);
        } finally {
            adapter.dispose();
        }
    });

    it("surfaces constraint violations from PGlite without stopping other records", async () => {
        const { handles } = makeTable();
        setSchemaText(handles, SCHEMA);
        handles.uiDef.set("query", "SELECT id, title FROM tasks");
        let errors: RecordSyncError[] = [];
        const adapter = new TableSyncAdapter(handles, {
            onRecordErrors: (e) => {
                errors = e;
            },
        });
        try {
            await adapter.start();
            const badId = addRecord(handles, { title: "x", status: "invalid-status" });
            addRecord(handles, { title: "y", status: "open" });
            await waitMicrotasks();
            await adapter.runQueryNow();

            expect(errors.some((e) => e.recordId === badId)).toBe(true);
            const result = await adapter.runQueryNow();
            expect(result?.rows.map((r) => r.title)).toEqual(["y"]);
        } finally {
            adapter.dispose();
        }
    });

    it("applies schema changes with a diff and deletes removed-column data", async () => {
        const { handles } = makeTable();
        setSchemaText(handles, SCHEMA);
        const adapter = new TableSyncAdapter(handles);
        try {
            await adapter.start();
            const recordId = addRecord(handles, { title: "t", points: 1, status: "open" });
            await waitMicrotasks();

            const next = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL)";
            const { parsed, diff } = await adapter.prepareSchemaChange(next);
            expect(diff.removedColumns.sort()).toEqual(["points", "status"]);

            await adapter.applySchema(parsed);
            expect(handles.schemaText.toString()).toBe(next);
            expect(handles.data.get(recordId)?.has("points")).toBe(false);
            expect(handles.data.get(recordId)?.get("title")).toBe("t");

            handles.uiDef.set("query", "SELECT id, title FROM tasks");
            const result = await adapter.runQueryNow();
            expect(result?.rows).toHaveLength(1);
        } finally {
            adapter.dispose();
        }
    });

    it("rebuilds when the schema text changes from another client", async () => {
        const { handles } = makeTable();
        setSchemaText(handles, SCHEMA);
        const adapter = new TableSyncAdapter(handles);
        try {
            await adapter.start();
            // Simulate a remote change: plain transaction with a foreign origin.
            handles.doc.transact(() => {
                handles.schemaText.delete(0, handles.schemaText.length);
                handles.schemaText.insert(0, "CREATE TABLE renamed (id TEXT PRIMARY KEY, note TEXT)");
            }, "remote");
            await waitMicrotasks();
            // Allow the async rebuild to finish.
            await new Promise((resolve) => setTimeout(resolve, 50));

            handles.uiDef.set("query", "SELECT id, note FROM renamed");
            addRecord(handles, { note: "n" });
            await waitMicrotasks();
            const result = await adapter.runQueryNow();
            expect(result?.rows).toHaveLength(1);
        } finally {
            adapter.dispose();
        }
    });

    it("does not duplicate rows for schemas without an id column", async () => {
        const { handles } = makeTable();
        setSchemaText(handles, "CREATE TABLE notes (body TEXT)");
        handles.uiDef.set("query", "SELECT body FROM notes");
        const adapter = new TableSyncAdapter(handles);
        try {
            await adapter.start();
            const recordId = addRecord(handles, { body: "first" });
            await waitMicrotasks();
            setRecordValue(handles, recordId, "body", "edited");
            await waitMicrotasks();
            const result = await adapter.runQueryNow();
            expect(result?.rows).toEqual([{ body: "edited" }]);
        } finally {
            adapter.dispose();
        }
    });

    it("returns correctly formatted date strings from queries (regression)", async () => {
        const { handles } = makeTable();
        setSchemaText(
            handles,
            "CREATE TABLE events (id TEXT PRIMARY KEY, due_date DATE, start_time TIMESTAMP, other_time TIMESTAMPTZ)",
        );
        handles.uiDef.set("query", "SELECT due_date, start_time, other_time FROM events");

        const adapter = new TableSyncAdapter(handles);
        try {
            await adapter.start();
            addRecord(handles, {
                due_date: "2026-07-15",
                start_time: "2026-07-15T12:30:00",
                other_time: "2026-07-15T15:45:00Z",
            }, "r1");
            await waitMicrotasks();
            await new Promise((resolve) => setTimeout(resolve, 100)); // allow async upsert
            const result = await adapter.runQueryNow();
            expect(result?.rows).toHaveLength(1);
            expect(result?.rows[0].due_date).toBe("2026-07-15");
            expect(result?.rows[0].start_time).toBe("2026-07-15T12:30:00.000Z");
            expect(result?.rows[0].other_time).toBe("2026-07-15T15:45:00.000Z");
        } finally {
            adapter.dispose();
        }
    });

    it("reports query errors without breaking the adapter", async () => {
        const { handles } = makeTable();
        setSchemaText(handles, SCHEMA);
        let queryError: string | undefined;
        const adapter = new TableSyncAdapter(handles, {
            onQueryError: (message) => {
                queryError = message;
            },
        });
        try {
            await adapter.start();
            handles.uiDef.set("query", "DELETE FROM tasks");
            await adapter.runQueryNow();
            expect(queryError).toMatch(/SELECT/i);

            handles.uiDef.set("query", "SELECT id FROM tasks");
            const result = await adapter.runQueryNow();
            expect(result?.columns).toEqual(["id"]);
            expect(queryError).toBeUndefined();
        } finally {
            adapter.dispose();
        }
    });
});
