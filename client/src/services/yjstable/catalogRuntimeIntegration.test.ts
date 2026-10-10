import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("browser catalog generations", { timeout: 30_000 }, () => {
    it("materializes catalog ENUMs on a cold route and rebuilds a mounted table in declaration order", async () => {
        const projectId = "catalog-generation-project";
        const projectDoc = new Y.Doc({ guid: projectId });
        const catalogDoc = projectDoc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const catalogId = createSqlCatalogObject(
            catalogDoc,
            "enum",
            "CREATE TYPE task_state AS ENUM ('Backlog', '', 'Done')",
        );
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const handles = getTableHandles(projectDoc, tableId)!;
        setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        addRecord(handles, { state: "Done" }, "done");
        addRecord(handles, { state: "" }, "empty");
        addRecord(handles, { state: "Backlog" }, "backlog");

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableId);
            expect(acquired?.adapter.appliedSchema?.columns.find(column => column.name === "state")?.enumLabels)
                .toEqual(["Backlog", "", "Done"]);
            await expect(acquired?.adapter.runQueryNow("SELECT id, state FROM tasks ORDER BY state"))
                .resolves.toEqual({
                    columns: ["id", "state"],
                    rows: [
                        { id: "backlog", state: "Backlog" },
                        { id: "empty", state: "" },
                        { id: "done", state: "Done" },
                    ],
                });

            replaceSqlCatalogSource(
                catalogDoc,
                catalogId,
                "CREATE TYPE task_state AS ENUM ('Done', '', 'Backlog')",
            );
            await expect.poll(
                async () => (await acquired?.adapter.runQueryNow("SELECT state FROM tasks ORDER BY state"))?.rows,
                { timeout: 10_000 },
            ).toEqual([{ state: "Done" }, { state: "" }, { state: "Backlog" }]);
            expect(handles.data.get("empty")?.get("state")).toBe("");
        } finally {
            session.dispose();
        }
    });
});
