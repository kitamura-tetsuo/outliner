import { createSqlCatalogObject, replaceSqlCatalogSource } from "$shared/services/sqlCatalog";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { resetPgliteForTests } from "./pgliteService";
import { RelationWriteError } from "./relationProvider";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

describe("catalog-bound field writes", { timeout: 30_000 }, () => {
    it("refuses a delayed edit and an unlisted label before mutating Yjs", async () => {
        const projectId = "catalog-write-authority";
        const projectDoc = new Y.Doc({ guid: projectId });
        const catalogDoc = projectDoc as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const catalogId = createSqlCatalogObject(
            catalogDoc,
            "enum",
            "CREATE TYPE task_state AS ENUM ('Open', 'Closed')",
        );
        const tableId = createTable(projectDoc, "Tasks", "tasks");
        const handles = getTableHandles(projectDoc, tableId)!;
        setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state task_state)");
        addRecord(handles, { state: "Open" }, "r1");
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableId);
            const staleToken = acquired!.adapter.writeAuthorityToken;
            replaceSqlCatalogSource(catalogDoc, catalogId, "CREATE TYPE task_state AS ENUM ('Closed')");

            expect(() => acquired!.adapter.commitRecordValue("r1", "state", "Closed", staleToken))
                .toThrow(RelationWriteError);
            expect(handles.data.get("r1")?.get("state")).toBe("Open");

            // Repair the preserved source record through the catalog service;
            // no client-side coercion or deletion is involved.
            replaceSqlCatalogSource(catalogDoc, catalogId, "CREATE TYPE task_state AS ENUM ('Open', 'Closed')");
            await expect.poll(() => acquired?.adapter.appliedSchema?.columns[1]?.enumLabels)
                .toEqual(["Open", "Closed"]);
            expect(() =>
                acquired!.adapter.commitRecordValue(
                    "r1",
                    "state",
                    "Unknown",
                    acquired!.adapter.writeAuthorityToken,
                )
            ).toThrow(/ENUM label/);
            expect(handles.data.get("r1")?.get("state")).toBe("Open");
        } finally {
            session.dispose();
        }
    });
});
