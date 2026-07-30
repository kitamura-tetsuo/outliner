import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "./pgliteService";
import { parseCreateTable } from "./schemaIntrospection";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, deleteRecord, getTableHandles, setRecordValue, setSchemaText } from "./tableDocs";
import { type RecordSyncError, TableSyncAdapter } from "./tableSyncAdapter";

const SCHEMA = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, points INTEGER, "
    + "status TEXT CHECK (status IN ('open', 'done')))";

function makeTable() {
    const projectDoc = new Y.Doc();
    const tableId = createTable(projectDoc, "Tasks", "tasks");
    const handles = getTableHandles(projectDoc, tableId)!;
    // Every table of a project shares one Postgres schema, so each test needs
    // its own project schema to stay isolated inside the shared engine.
    return { projectDoc, handles, pgSchema: projectSchemaName(projectDoc.guid) };
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
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        handles.uiDef.set("query", "SELECT id, title, points FROM tasks ORDER BY title");
        addRecord(handles, { title: "b task", points: 2, status: "open" });
        addRecord(handles, { title: "a task", points: 1, status: "done" });

        const adapter = new TableSyncAdapter(handles, { pgSchema });
        try {
            await adapter.start();
            const result = await adapter.runQueryNow();
            expect(result?.columns).toEqual(["id", "title", "points"]);
            expect(result?.rows.map((r) => r.title)).toEqual(["a task", "b task"]);
        } finally {
            adapter.dispose();
        }
    });

    it("only emits the result of the latest runQueryNow call, ignoring slow older runs", async () => {
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        const adapter = new TableSyncAdapter(handles, { pgSchema });

        // Mock executeQuery to control execution speed
        let slowRunStarted = false;
        let resolveSlowRun: (value: unknown) => void;
        const slowRunPromise = new Promise(resolve => {
            resolveSlowRun = resolve;
        });

        (adapter as unknown as {
            executeQuery: (sql: string) => Promise<{ columns: string[]; rows: { id: string; }[]; }>;
        }).executeQuery = async (_selectSql: string) => {
            if (!slowRunStarted) {
                slowRunStarted = true;
                await slowRunPromise;
                return { columns: ["id"], rows: [{ id: "slow" }] };
            } else {
                return { columns: ["id"], rows: [{ id: "fast" }] };
            }
        };

        try {
            await adapter.start();
            handles.uiDef.set("query", "SELECT id FROM tasks"); // trigger a query

            // start first run (will be slow)
            const firstRunPromise = adapter.runQueryNow();

            // start second run (will be fast)
            const secondRunPromise = adapter.runQueryNow();
            const secondRunResult = await secondRunPromise;

            // let the first run finish now that the second is done
            resolveSlowRun!(undefined);
            const firstRunResult = await firstRunPromise;

            // The first run should return undefined because it's stale
            expect(firstRunResult).toBeUndefined();
            // The second run should return its result
            expect(secondRunResult?.rows[0].id).toBe("fast");

            expect((adapter as unknown as { lastResult: { rows: { id: string; }[]; }; }).lastResult.rows[0].id).toBe(
                "fast",
            );
        } finally {
            adapter.dispose();
        }
    });

    it("syncs incremental record changes (insert, update, delete)", async () => {
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        handles.uiDef.set("query", "SELECT id, title, points FROM tasks");
        const adapter = new TableSyncAdapter(handles, { pgSchema });
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
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        handles.uiDef.set("query", "SELECT id, title FROM tasks");
        let errors: RecordSyncError[] = [];
        const adapter = new TableSyncAdapter(handles, { pgSchema });
        adapter.subscribe({
            onRecordErrors: (e: RecordSyncError[]) => {
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
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        handles.uiDef.set("query", "SELECT id, title FROM tasks");
        let errors: RecordSyncError[] = [];
        const adapter = new TableSyncAdapter(handles, { pgSchema });
        adapter.subscribe({
            onRecordErrors: (e: RecordSyncError[]) => {
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
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        const adapter = new TableSyncAdapter(handles, { pgSchema });
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

    it("refuses a schema whose table name is the reserved items relation", async () => {
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        const adapter = new TableSyncAdapter(handles, { pgSchema });
        try {
            await adapter.start();
            const reserved = "CREATE TABLE outline_items (id TEXT PRIMARY KEY, title TEXT)";
            await expect(adapter.prepareSchemaChange(reserved)).rejects.toThrow(/reserved/);

            const parsed = await parseCreateTable(reserved);
            await expect(adapter.applySchema(parsed)).rejects.toThrow(/reserved/);
            // The refusal left the applied schema alone.
            expect(adapter.appliedSchema?.tableName).toBe("tasks");
            expect(handles.schemaText.toString()).toBe(SCHEMA);
        } finally {
            adapter.dispose();
        }
    });

    it("reports the conflict when a reserved name arrives in the schema text", async () => {
        const { handles, pgSchema } = makeTable();
        // As a remote client would deliver it: straight into the Y.Text.
        setSchemaText(handles, "CREATE TABLE outline_items (id TEXT PRIMARY KEY, title TEXT)");
        const adapter = new TableSyncAdapter(handles, { pgSchema });
        let schemaError: string | undefined;
        try {
            adapter.subscribe({ onSchemaChanged: (_schema, error) => (schemaError = error) });
            await adapter.start();
            expect(schemaError).toMatch(/reserved/);
            expect(adapter.appliedSchema).toBeUndefined();
        } finally {
            adapter.dispose();
        }
    });

    it("allows undoing a schema change that dropped a column with data", async () => {
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        const adapter = new TableSyncAdapter(handles, { pgSchema });
        try {
            await adapter.start();
            const recordId = addRecord(handles, { title: "t", points: 1, status: "open" });
            await waitMicrotasks();

            // Stop capturing so the setup transactions aren't undone together with the schema change.
            handles.undo.stopCapturing();

            const next = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL)";
            const { parsed } = await adapter.prepareSchemaChange(next);
            await adapter.applySchema(parsed);

            expect(handles.schemaText.toString()).toBe(next);
            expect(handles.data.get(recordId)?.has("points")).toBe(false);

            handles.undo.undo();
            expect(handles.schemaText.toString()).toBe(SCHEMA);
            expect(handles.data.get(recordId)?.get("points")).toBe(1);
        } finally {
            adapter.dispose();
        }
    });

    it("rebuilds when the schema text changes from another client", async () => {
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        const adapter = new TableSyncAdapter(handles, { pgSchema });
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
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, "CREATE TABLE notes (body TEXT)");
        handles.uiDef.set("query", "SELECT body FROM notes");
        const adapter = new TableSyncAdapter(handles, { pgSchema });
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
        const { handles, pgSchema } = makeTable();
        setSchemaText(
            handles,
            "CREATE TABLE events (id TEXT PRIMARY KEY, due_date DATE, start_time TIMESTAMP, other_time TIMESTAMPTZ)",
        );
        handles.uiDef.set("query", "SELECT due_date, start_time, other_time FROM events");

        const adapter = new TableSyncAdapter(handles, { pgSchema });
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
        const { handles, pgSchema } = makeTable();
        setSchemaText(handles, SCHEMA);
        let queryError: string | undefined;
        const adapter = new TableSyncAdapter(handles, { pgSchema });
        adapter.subscribe({
            onQueryError: (message: string | undefined) => {
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
