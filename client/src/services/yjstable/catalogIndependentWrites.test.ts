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

describe("catalog-independent Table writes", { timeout: 60_000 }, () => {
    it("keeps scalar bulk writes authoritative while another Table uses the catalog", async () => {
        const doc = new Y.Doc({ guid: "catalog-independent-writes" });
        const catalogDoc = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const catalogId = createSqlCatalogObject(
            catalogDoc,
            "enum",
            "CREATE TYPE task_state AS ENUM ('Open', 'Closed')",
        );
        const typedId = createTable(doc, "Typed", "typed_tasks");
        const typed = getTableHandles(doc, typedId)!;
        setSchemaText(typed, "CREATE TABLE typed_tasks (id TEXT PRIMARY KEY, state task_state)");
        addRecord(typed, { state: "Open" }, "typed-1");
        const scalarId = createTable(doc, "Scalar", "scalar_tasks");
        const scalar = getTableHandles(doc, scalarId)!;
        setSchemaText(scalar, "CREATE TABLE scalar_tasks (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN)");
        addRecord(scalar, { title: "Alpha", done: false }, "scalar-1");

        const session = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect: localConnector });
        try {
            await session.acquire(typedId);
            const acquired = await session.acquire(scalarId);
            doc.transact(() => {
                acquired!.adapter.commitRecordValue(
                    "scalar-1",
                    "title",
                    "Updated",
                    acquired!.adapter.writeAuthorityToken,
                );
                acquired!.adapter.commitRecordValue("scalar-1", "done", true, acquired!.adapter.writeAuthorityToken);
            });
            expect(Object.fromEntries(scalar.data.get("scalar-1")!.entries())).toEqual({
                id: "scalar-1",
                title: "Updated",
                done: true,
            });
            await expect.poll(
                async () => (await acquired!.adapter.runQueryNow("SELECT id, title, done FROM scalar_tasks"))?.rows,
            ).toEqual([{ id: "scalar-1", title: "Updated", done: true }]);

            replaceSqlCatalogSource(catalogDoc, catalogId, "CREATE TYPE task_state AS ENUM ('Closed', 'Open')");
            await expect.poll(
                async () => (await acquired!.adapter.runQueryNow("SELECT id, title, done FROM scalar_tasks"))?.rows,
                { timeout: 30_000 },
            ).toEqual([{ id: "scalar-1", title: "Updated", done: true }]);
            expect(Object.fromEntries(scalar.data.get("scalar-1")!.entries())).toEqual({
                id: "scalar-1",
                title: "Updated",
                done: true,
            });
        } finally {
            session.dispose();
        }
    });
});
