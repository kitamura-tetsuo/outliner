import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

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

    it("does not report ready until dependent table inputs compile and recovers in the mounted session", async () => {
        const projectId = "catalog-invalid-dependent-project";
        const projectDoc = new Y.Doc({ guid: projectId });
        const catalogDoc = projectDoc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        createSqlCatalogObject(catalogDoc, "enum", "CREATE TYPE task_state AS ENUM ('Open')");
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const handles = getTableHandles(projectDoc, tableId)!;
        setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state missing_state)");

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableId);
            await expect(session.catalogReady()).rejects.toThrow(/missing_state|does not exist/i);
            expect(acquired?.adapter.appliedSchema).toBeUndefined();

            setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
            await expect.poll(() => acquired?.adapter.appliedSchema?.columns[1]?.enumLabels).toEqual(["Open"]);
            await expect(session.catalogReady()).resolves.toBeUndefined();
        } finally {
            session.dispose();
        }
    });

    it("invalidates a completed Grid execution immediately when the catalog generation changes", async () => {
        const projectId = "catalog-grid-currency";
        const projectDoc = new Y.Doc({ guid: projectId });
        const catalogDoc = projectDoc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const catalogId = createSqlCatalogObject(catalogDoc, "enum", "CREATE TYPE priority AS ENUM ('Low', 'High')");
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const handles = getTableHandles(projectDoc, tableId)!;
        setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, priority priority)");
        addRecord(handles, { priority: "Low" }, "r1");
        const gridId = createGrid(projectDoc, tableId, { query: "SELECT id, priority FROM tasks ORDER BY priority" });
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        let execution: TableQueryExecution | undefined;
        try {
            const acquired = await session.acquire(tableId);
            const runner = new GridQueryRunner({
                sourceAdapter: acquired!.adapter,
                grid: getGridHandles(projectDoc, gridId)!,
            });
            runner.subscribe({ onResult: (_result, next) => execution = next });
            runner.start();
            await expect.poll(() => execution?.status).toBe("completed");

            replaceSqlCatalogSource(catalogDoc, catalogId, "CREATE TYPE priority AS ENUM ('High', 'Low')");
            expect(execution).toBeUndefined();
            runner.dispose();
        } finally {
            session.dispose();
        }
    });
});
