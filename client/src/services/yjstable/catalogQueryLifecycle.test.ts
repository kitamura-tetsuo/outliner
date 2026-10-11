import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { createGrid, getGridHandles } from "./gridDocs";
import { GridQueryRunner } from "./gridQueryRunner";
import { ITEMS_RELATION_NAME } from "./itemsRelation";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName, quoteIdent } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setRecordValue, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";
import type { TableQueryExecution } from "./tableQueryRunner";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("catalog query lifecycle", { timeout: 60_000 }, () => {
    it("invalidates and reorders a mounted scalar Table query with an explicit ENUM cast", async () => {
        const projectId = "catalog-text-cast";
        const doc = new Y.Doc({ guid: projectId });
        const catalog = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const objectId = createSqlCatalogObject(catalog, "enum", "CREATE TYPE task_state AS ENUM ('Open', 'Done')");
        const tableId = createTable(doc, "Tasks", "tasks");
        const table = getTableHandles(doc, tableId)!;
        setSchemaText(table, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state TEXT)");
        addRecord(table, { state: "Open" }, "open");
        addRecord(table, { state: "Done" }, "done");
        const gridId = createGrid(doc, tableId, {
            query: "SELECT id, state::task_state AS typed_state FROM tasks ORDER BY state::task_state",
        });
        const session = createTableEngineSession({ projectDoc: doc, projectId, connect: localConnector });
        const acquired = await session.acquire(tableId);
        const runner = new GridQueryRunner({ sourceAdapter: acquired!.adapter, grid: getGridHandles(doc, gridId)! });
        let execution: TableQueryExecution | undefined;
        let rows: Record<string, unknown>[] = [];
        let invalidated = false;
        runner.subscribe({
            onResult: (result, next) => {
                rows = result.rows;
                execution = next;
            },
            onInvalidated: () => {
                invalidated = true;
                execution = undefined;
            },
        });
        runner.start();
        await expect.poll(() => execution?.status).toBe("completed");
        expect(rows.map(row => row.id)).toEqual(["open", "done"]);

        replaceSqlCatalogSource(catalog, objectId, "CREATE TYPE task_state AS ENUM ('Done', 'Open')");
        expect(invalidated).toBe(true);
        await expect.poll(() => rows.map(row => row.id), { timeout: 30_000 }).toEqual(["done", "open"]);
        expect(execution?.status).toBe("completed");
        runner.dispose();
        session.dispose();
    });

    it("reconstructs a live items relation before publishing the replacement catalog", async () => {
        const projectId = "catalog-live-items";
        const doc = new Y.Doc({ guid: projectId });
        const catalog = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const objectId = createSqlCatalogObject(catalog, "enum", "CREATE TYPE task_state AS ENUM ('Open', 'Done')");
        const project = Project.fromDoc(doc);
        const page = new Items(doc, project.tree, "root").addNode("tester");
        const item = new Items(doc, project.tree, page.key).addNode("tester");
        item.text = "Preserved item";
        item.due = "2026-10-10T09:00:00Z";
        const session = createTableEngineSession({ projectDoc: doc, projectId, connect: localConnector });
        await session.resolveRelation(ITEMS_RELATION_NAME);

        replaceSqlCatalogSource(catalog, objectId, "CREATE TYPE task_state AS ENUM ('Done', 'Open')");
        await session.catalogReady();
        const relation = `${quoteIdent(projectSchemaName(projectId))}.${quoteIdent(ITEMS_RELATION_NAME)}`;
        await expect(runSelect(`SELECT text FROM ${relation}`)).resolves.toMatchObject({
            rows: [{ text: "Preserved item" }],
        });
        session.dispose();
    });

    it("recovers a cold typed Table when its invalid synchronized record is corrected", async () => {
        const projectId = "catalog-record-recovery";
        const doc = new Y.Doc({ guid: projectId });
        createSqlCatalogObject(
            doc as unknown as Parameters<typeof createSqlCatalogObject>[0],
            "enum",
            "CREATE TYPE task_state AS ENUM ('Open')",
        );
        const tableId = createTable(doc, "Tasks", "tasks");
        const table = getTableHandles(doc, tableId)!;
        setSchemaText(table, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        addRecord(table, { state: "Remote invalid" }, "r1");
        const session = createTableEngineSession({ projectDoc: doc, projectId, connect: localConnector });
        const acquired = await session.acquire(tableId);
        await expect(session.catalogReady()).rejects.toThrow(/Invalid ENUM label|invalid input value/i);

        setRecordValue(table, "r1", "state", "Open");
        await expect.poll(
            () => acquired?.adapter.appliedSchema?.columns[1]?.enumLabels,
            { timeout: 30_000 },
        ).toEqual(["Open"]);
        await expect(acquired?.adapter.runQueryNow("SELECT state FROM tasks")).resolves.toEqual({
            columns: ["state"],
            rows: [{ state: "Open" }],
        });
        session.dispose();
    });
});
