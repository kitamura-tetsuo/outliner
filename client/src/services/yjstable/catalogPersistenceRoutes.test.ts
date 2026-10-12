import { createSqlCatalogObject } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { runCalendarQuery } from "../calendar/calendarQueryRunner";
import { createGrid, getGridHandles } from "./gridDocs";
import { GridQueryRunner } from "./gridQueryRunner";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";
import type { TableQueryExecution } from "./tableQueryRunner";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("catalog persistence route boundaries", { timeout: 60_000 }, () => {
    it("reconstructs cold Table, Grid, and Calendar execution from persisted Yjs bytes", async () => {
        const projectId = "catalog-persisted-routes";
        const source = new Y.Doc({ guid: projectId });
        createSqlCatalogObject(
            source as unknown as Parameters<typeof createSqlCatalogObject>[0],
            "enum",
            "CREATE TYPE task_state AS ENUM ('Open', 'Closed')",
        );
        const tableId = createTable(source, "Tasks", "tasks");
        const sourceTable = getTableHandles(source, tableId)!;
        setSchemaText(sourceTable, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        addRecord(sourceTable, { state: "Closed" }, "r1");
        const gridId = createGrid(source, tableId, {
            query: "SELECT id, state FROM tasks ORDER BY state",
        });

        // Recreate the client solely from the same update bytes persisted for
        // the project document and Table subdocument. No live object from the
        // authoring client crosses this boundary.
        const fresh = new Y.Doc({ guid: projectId });
        Y.applyUpdate(fresh, Y.encodeStateAsUpdate(source));
        const freshTable = getTableHandles(fresh, tableId)!;
        Y.applyUpdate(freshTable.doc, Y.encodeStateAsUpdate(sourceTable.doc));
        source.destroy();

        const session = createTableEngineSession({ projectDoc: fresh, projectId, connect: localConnector });
        let execution: TableQueryExecution | undefined;
        let rows: Record<string, unknown>[] | undefined;
        try {
            const acquired = await session.acquire(tableId);
            const runner = new GridQueryRunner({
                sourceAdapter: acquired!.adapter,
                grid: getGridHandles(fresh, gridId)!,
            });
            runner.subscribe({
                onResult: (result, next) => {
                    rows = result.rows;
                    execution = next;
                },
            });
            runner.start();
            await expect.poll(() => execution?.status).toBe("completed");
            expect(rows).toEqual([{ id: "r1", state: "Closed" }]);

            await expect(runCalendarQuery(
                session,
                acquired!.adapter.sharedPgSchema,
                "SELECT 'Open'::task_state AS state",
            )).resolves.toEqual({
                result: { columns: ["state"], rows: [{ state: "Open" }] },
            });
            expect(freshTable.data.get("r1")?.get("state")).toBe("Closed");
            runner.dispose();
        } finally {
            session.dispose();
            fresh.destroy();
        }
    });
});
