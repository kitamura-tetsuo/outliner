import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "./pgliteService";
import { RelationWriteError } from "./relationProvider";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { TableRelationProvider } from "./tableRelationProvider";
import { TableSyncAdapter } from "./tableSyncAdapter";

const SCHEMA = "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, points INTEGER)";

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
