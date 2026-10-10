import { createSqlCatalogObject, removeSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { runCalendarQuery } from "../calendar/calendarQueryRunner";
import type { CatalogRuntimeState } from "./catalogRuntime";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

// Transport is outside these runtime ordering regressions. The compiler,
// PGlite, Yjs field writes, and query runner execute their production logic.
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(async () => {
    vi.restoreAllMocks();
    await resetTableEngineForTests();
});
afterAll(resetPgliteForTests);

describe("catalog replacement input changes", { timeout: 90_000 }, () => {
    it.each(["reorder", "remove last type"])(
        "recovers after a captured scalar record changes during %s",
        async change => {
            const doc = new Y.Doc({ guid: `catalog-scalar-build-${change}` });
            const catalogDoc = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
            const catalogId = createSqlCatalogObject(
                catalogDoc,
                "enum",
                "CREATE TYPE task_state AS ENUM ('Open', 'Closed')",
            );
            const tableId = createTable(doc, "Scalar", "scalar_tasks");
            const handles = getTableHandles(doc, tableId)!;
            setSchemaText(handles, "CREATE TABLE scalar_tasks (id TEXT PRIMARY KEY, title TEXT)");
            addRecord(handles, { title: "Before" }, "scalar-1");

            const session = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect: localConnector });
            let currentState: CatalogRuntimeState | undefined;
            const observedStates: string[] = [];
            const unsubscribe = session.subscribeCatalog(state => {
                currentState = state;
                observedStates.push(state.status);
            });
            try {
                const acquired = (await session.acquire(tableId))!;
                await session.catalogReady();
                const query = () =>
                    runCalendarQuery(session, acquired.adapter.sharedPgSchema, "SELECT title FROM scalar_tasks");
                expect(await query()).toEqual({ result: { columns: ["title"], rows: [{ title: "Before" }] } });

                observedStates.length = 0;
                const record = handles.data.get("scalar-1")!;
                // This pass-through spy only observes the real snapshot read;
                // it does not replace its values or any compiler/SQL outcome.
                const snapshotRead = vi.spyOn(record, "entries");
                if (change === "reorder") {
                    replaceSqlCatalogSource(catalogDoc, catalogId, "CREATE TYPE task_state AS ENUM ('Closed', 'Open')");
                } else {
                    expect(removeSqlCatalogObject(catalogDoc, catalogId)).toBe(true);
                }
                expect(observedStates).toEqual(["building"]);
                expect(snapshotRead).toHaveBeenCalled();
                snapshotRead.mockRestore();

                // Input capture completed synchronously before the edit. The
                // replacement is still awaiting real compiler/DB work.
                acquired.adapter.commitRecordValue("scalar-1", "title", "After", acquired.adapter.writeAuthorityToken);
                expect(record.get("title")).toBe("After");

                // Await actual build settlement before checking recovery, so
                // a failure distinguishes a stranded state from a slow build.
                const settledBuild = await session.catalogReady().then(
                    () => "ready",
                    error => error instanceof Error ? error.message : String(error),
                );
                await expect.poll(() => currentState?.status, {
                    timeout: 5_000,
                    message: `Build settled as ${settledBuild}; observed states: ${observedStates.join(", ")}`,
                }).toBe("ready");
                await expect(session.catalogReady()).resolves.toBeUndefined();
                expect(await query()).toEqual({ result: { columns: ["title"], rows: [{ title: "After" }] } });
                expect([...handles.data.keys()]).toEqual(["scalar-1"]);
            } finally {
                unsubscribe();
                session.dispose();
            }
        },
    );
});
