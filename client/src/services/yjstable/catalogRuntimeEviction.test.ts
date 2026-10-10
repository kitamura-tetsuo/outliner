import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { runCalendarQuery } from "../calendar/calendarQueryRunner";
import type { CatalogRuntimeState } from "./catalogRuntime";
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

// This test controls the cache clock, not the compiler or SQL outcomes.
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(async () => {
    vi.restoreAllMocks();
    await resetTableEngineForTests();
});
afterAll(resetPgliteForTests);

describe("catalog replacement during warm eviction", { timeout: 90_000 }, () => {
    it("recovers when real eviction unregisters a captured Table before publication", async () => {
        const doc = new Y.Doc({ guid: "catalog-eviction-input" });
        const catalogDoc = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const catalogId = createSqlCatalogObject(
            catalogDoc,
            "enum",
            "CREATE TYPE task_state AS ENUM ('Open', 'Closed')",
        );
        const tableId = createTable(doc, "Tasks", "tasks");
        const handles = getTableHandles(doc, tableId)!;
        setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        addRecord(handles, { state: "Open" }, "r1");
        let now = 1;
        setTableEngineClockForTests(() => now);
        const options = { projectDoc: doc, projectId: doc.guid, connect: localConnector };
        const tableView = createTableEngineSession(options);
        const queryView = createTableEngineSession(options);
        const reopenedView = createTableEngineSession(options);
        let currentState: CatalogRuntimeState | undefined;
        const unsubscribe = queryView.subscribeCatalog(state => currentState = state);
        try {
            const acquired = (await tableView.acquire(tableId))!;
            await queryView.catalogReady();
            const pgSchema = acquired.adapter.sharedPgSchema;
            expect(await runCalendarQuery(queryView, pgSchema, "SELECT 'Open'::task_state AS state"))
                .toEqual({ result: { columns: ["state"], rows: [{ state: "Open" }] } });
            tableView.dispose();

            const snapshotRead = vi.spyOn(handles.data.get("r1")!, "entries");
            replaceSqlCatalogSource(catalogDoc, catalogId, "CREATE TYPE task_state AS ENUM ('Closed', 'Open')");
            expect(currentState?.status).toBe("building");
            expect(snapshotRead).toHaveBeenCalled();
            snapshotRead.mockRestore();

            // Observe, then invoke, the actual adapter disposal driven by the
            // engine's real TTL sweep. This proves the required overlap.
            const disposalStates: string[] = [];
            const dispose = acquired.adapter.dispose.bind(acquired.adapter);
            vi.spyOn(acquired.adapter, "dispose").mockImplementation(() => {
                disposalStates.push(currentState!.status);
                dispose();
            });
            now += WARM_RETENTION_MS + 1;
            await runWarmEvictionForTests();
            expect(disposalStates).toEqual(["building"]);
            await expect(queryView.catalogReady()).resolves.toBeUndefined();
            expect(currentState?.status).toBe("ready");
            expect(await runCalendarQuery(queryView, pgSchema, "SELECT 'Closed'::task_state AS state"))
                .toEqual({ result: { columns: ["state"], rows: [{ state: "Closed" }] } });

            const reopened = (await reopenedView.acquire(tableId))!;
            expect(reopened.adapter).not.toBe(acquired.adapter);
            await reopenedView.catalogReady();
            expect(await runCalendarQuery(reopenedView, pgSchema, "SELECT id, state FROM tasks"))
                .toEqual({ result: { columns: ["id", "state"], rows: [{ id: "r1", state: "Open" }] } });
            expect(Object.fromEntries(handles.data.get("r1")!.entries())).toEqual({ id: "r1", state: "Open" });
        } finally {
            unsubscribe();
            tableView.dispose();
            queryView.dispose();
            reopenedView.dispose();
        }
    });
});
