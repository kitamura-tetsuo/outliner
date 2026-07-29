import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "./pgliteService";
import { RelationWriteError } from "./relationProvider";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { TableRelationProvider } from "./tableRelationProvider";
import { TableSyncAdapter } from "./tableSyncAdapter";

const SCHEMA = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, points INTEGER, labels TEXT)";

function makeProvider() {
    const projectDoc = new Y.Doc();
    const tableId = createTable(projectDoc, "Tasks", "tasks");
    const handles = getTableHandles(projectDoc, tableId)!;
    setSchemaText(handles, SCHEMA);
    const adapter = new TableSyncAdapter(handles, { pgSchema: projectSchemaName(projectDoc.guid) });
    const ready = adapter.start();
    return { handles, adapter, provider: new TableRelationProvider(handles, adapter, ready), ready };
}

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost.
describe("TableRelationProvider", { timeout: 30000 }, () => {
    it("reports the applied schema's name once materialized", async () => {
        const { provider, adapter } = makeProvider();
        try {
            expect(await provider.materialize()).toBe(true);
            expect(provider.sqlName).toBe("tasks");
        } finally {
            adapter.dispose();
        }
    });

    it("writes back into the table's Data Storage, not into PGlite", async () => {
        const { handles, adapter, provider } = makeProvider();
        try {
            await provider.materialize();
            const recordId = addRecord(handles, { title: "first", points: 1 });

            await provider.applyWrite({ op: "UPDATE", rowId: recordId, column: "title", value: "edited" });
            expect(handles.data.get(recordId)?.get("title")).toBe("edited");

            await provider.applyWrite({ op: "INSERT", values: { title: "second", points: 2 } });
            expect(handles.data.size).toBe(2);

            await provider.applyWrite({ op: "DELETE", rowId: recordId });
            expect(handles.data.has(recordId)).toBe(false);
        } finally {
            adapter.dispose();
        }
    });

    it("appends to a JSON-array-encoded column via UPDATE_APPEND (grouping-lane 'add' drop)", async () => {
        const { handles, adapter, provider } = makeProvider();
        try {
            await provider.materialize();
            const recordId = addRecord(handles, { title: "first", points: 1, labels: JSON.stringify(["work"]) });

            await provider.applyWrite({ op: "UPDATE_APPEND", rowId: recordId, column: "labels", value: "urgent" });
            expect(JSON.parse(String(handles.data.get(recordId)?.get("labels")))).toEqual(["work", "urgent"]);

            // Appending an already-present value is a no-op, not a duplicate.
            await provider.applyWrite({ op: "UPDATE_APPEND", rowId: recordId, column: "labels", value: "work" });
            expect(JSON.parse(String(handles.data.get(recordId)?.get("labels")))).toEqual(["work", "urgent"]);
        } finally {
            adapter.dispose();
        }
    });

    it("creates the array when UPDATE_APPEND targets a column with no existing value", async () => {
        const { handles, adapter, provider } = makeProvider();
        try {
            await provider.materialize();
            const recordId = addRecord(handles, { title: "first", points: 1 });

            await provider.applyWrite({ op: "UPDATE_APPEND", rowId: recordId, column: "labels", value: "new" });
            expect(JSON.parse(String(handles.data.get(recordId)?.get("labels")))).toEqual(["new"]);
        } finally {
            adapter.dispose();
        }
    });

    it("rejects UPDATE_APPEND for a record that does not exist", async () => {
        const { adapter, provider } = makeProvider();
        try {
            await provider.materialize();
            await expect(
                provider.applyWrite({ op: "UPDATE_APPEND", rowId: "missing", column: "labels", value: "x" }),
            ).rejects.toThrow(RelationWriteError);
        } finally {
            adapter.dispose();
        }
    });

    it("needs neither a destination nor a disposition, unlike the items relation", async () => {
        const { handles, adapter, provider } = makeProvider();
        try {
            await provider.materialize();
            expect(provider.capabilities).toEqual({
                update: true,
                insert: { requiresDestination: false },
                delete: { requiresDisposition: false },
            });
            // A record that does not exist is still an error: an UPDATE has to
            // address a row, there is nothing to create implicitly.
            await expect(
                provider.applyWrite({ op: "UPDATE", rowId: "missing", column: "title", value: "x" }),
            ).rejects.toThrow(RelationWriteError);
            expect(handles.data.size).toBe(0);
        } finally {
            adapter.dispose();
        }
    });
});
