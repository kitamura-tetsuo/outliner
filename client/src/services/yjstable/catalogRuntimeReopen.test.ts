import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { runCalendarQuery } from "../calendar/calendarQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    runWarmEvictionForTests,
    setTableEngineClockForTests,
    type TableDocConnector,
    WARM_RETENTION_MS,
} from "./tableEngine";

afterEach(async () => {
    vi.restoreAllMocks();
    await resetTableEngineForTests();
});
afterAll(resetPgliteForTests);

describe("catalog registration during cache reopen", { timeout: 90_000 }, () => {
    it("keeps the successor registered when predecessor cleanup is delayed", async () => {
        const doc = new Y.Doc({ guid: "catalog-reopen-ownership" });
        const catalogDoc = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const catalogId = createSqlCatalogObject(
            catalogDoc,
            "enum",
            "CREATE TYPE task_state AS ENUM ('Open', 'Closed')",
        );
        const blockerId = createTable(doc, "Blocker", "blocker");
        setSchemaText(getTableHandles(doc, blockerId)!, "CREATE TABLE blocker (id TEXT PRIMARY KEY)");
        const tableId = createTable(doc, "Tasks", "tasks");
        const handles = getTableHandles(doc, tableId)!;
        setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        addRecord(handles, { state: "Open" }, "r1");
        addRecord(handles, { state: "Closed" }, "r2");

        let releaseCleanup = () => {};
        let notifyCleanup = () => {};
        const cleanupGate = new Promise<void>(resolve => releaseCleanup = resolve);
        const cleanupReached = new Promise<void>(resolve => notifyCleanup = resolve);
        // Pause only the connection-disposal boundary. The engine still owns
        // eviction, adapter disposal, registration, compilation and PGlite.
        const connect: TableDocConnector = async (_projectId, id) => ({
            waitForInitialSync: async () => ({ synced: true }),
            dispose: async () => {
                if (id !== blockerId) return;
                notifyCleanup();
                await cleanupGate;
            },
        });
        let now = 1;
        setTableEngineClockForTests(() => now);
        const options = { projectDoc: doc, projectId: doc.guid, connect };
        const blockerView = createTableEngineSession(options);
        const tableView = createTableEngineSession(options);
        const reopenedView = createTableEngineSession(options);
        let eviction: Promise<void> | undefined;
        try {
            // Creation order makes blocker cleanup precede the target entry.
            await blockerView.acquire(blockerId);
            const original = (await tableView.acquire(tableId))!;
            await tableView.catalogReady();
            const pgSchema = original.adapter.sharedPgSchema;
            const query = "SELECT id, state FROM tasks ORDER BY state";
            expect(await runCalendarQuery(tableView, pgSchema, query)).toEqual({
                result: {
                    columns: ["id", "state"],
                    rows: [{ id: "r1", state: "Open" }, { id: "r2", state: "Closed" }],
                },
            });
            const originalDispose = vi.spyOn(original.adapter, "dispose");
            blockerView.dispose();
            tableView.dispose();
            now += WARM_RETENTION_MS + 1;
            eviction = runWarmEvictionForTests();
            await cleanupReached;
            expect(originalDispose).not.toHaveBeenCalled();

            // The entry has been evicted, but its old adapter is demonstrably
            // still awaiting cleanup. A real acquire creates its successor.
            const reopened = (await reopenedView.acquire(tableId))!;
            expect(reopened.adapter).not.toBe(original.adapter);
            releaseCleanup();
            await eviction;
            expect(originalDispose).toHaveBeenCalledTimes(1);

            // A retired generation's dependency set can mask a lost
            // registration on the first change. The next change must still
            // rebuild this same successor and preserve real SQL ordering.
            for (
                const rows of [
                    [{ id: "r2", state: "Closed" }, { id: "r1", state: "Open" }],
                    [{ id: "r1", state: "Open" }, { id: "r2", state: "Closed" }],
                ]
            ) {
                const labels = rows.map(row => row.state);
                replaceSqlCatalogSource(
                    catalogDoc,
                    catalogId,
                    `CREATE TYPE task_state AS ENUM (${labels.map(label => `'${label}'`).join(", ")})`,
                );
                await reopenedView.catalogReady();
                await expect.poll(() => reopened.adapter.appliedSchema?.columns[1]?.enumLabels).toEqual(labels);
                expect(await runCalendarQuery(reopenedView, pgSchema, query)).toEqual({
                    result: { columns: ["id", "state"], rows },
                });
            }
            expect([...handles.data.entries()].map(([id, record]) => [id, record.get("state")]))
                .toEqual([["r1", "Open"], ["r2", "Closed"]]);
        } finally {
            releaseCleanup();
            await eviction;
            blockerView.dispose();
            tableView.dispose();
            reopenedView.dispose();
        }
    });
});
