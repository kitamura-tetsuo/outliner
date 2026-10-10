import "fake-indexeddb/auto";

import { createSqlCatalogObject, readSqlCatalog } from "$shared/services/sqlCatalog";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createPersistence, waitForSync } from "./yjsPersistence";

const PROJECT_ID = "sql-catalog-persistence-project";

async function deleteProjectDatabase(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(`container-${PROJECT_ID}`);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("SQL catalog test database deletion was blocked"));
    });
}

describe("SQL catalog Project persistence", () => {
    afterEach(deleteProjectDatabase);

    it("reopens identities and exact sources through the Project IndexedDB provider", async () => {
        const source = "-- retain comments and whitespace\nCREATE TYPE task_state AS ENUM (\n  'open',\n  'done'\n);\n";
        const original = new Y.Doc();
        const writerPersistence = createPersistence(PROJECT_ID, original);
        await waitForSync(writerPersistence);
        // The workspaces currently install distinct patch versions of Yjs;
        // this cast crosses that package-type boundary while both APIs operate
        // on the same runtime Y.Doc attached to the production provider.
        const catalogDoc = original as unknown as Parameters<typeof createSqlCatalogObject>[0];
        const objectId = createSqlCatalogObject(catalogDoc, "enum", source);
        const originalResult = readSqlCatalog(PROJECT_ID, catalogDoc);
        expect(originalResult.status).toBe("ready");
        if (originalResult.status !== "ready") throw new Error("Expected the written catalog to be ready");

        // y-indexeddb commits document updates asynchronously. A transaction
        // against its actual database forms the storage barrier before close.
        const database = await writerPersistence._db;
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(["updates"], "readonly");
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.objectStore("updates").count();
        });
        await writerPersistence.destroy();
        original.destroy();

        const reopened = new Y.Doc();
        const readerPersistence = createPersistence(PROJECT_ID, reopened);
        await waitForSync(readerPersistence);
        const reopenedCatalogDoc = reopened as unknown as Parameters<typeof readSqlCatalog>[1];
        const reopenedResult = readSqlCatalog(PROJECT_ID, reopenedCatalogDoc);
        expect(reopenedResult.status).toBe("ready");
        if (reopenedResult.status !== "ready") throw new Error("Expected the reopened catalog to be ready");
        expect(reopenedResult.snapshot.objects).toEqual([{ id: objectId, kind: "enum", source }]);
        expect(reopenedResult.snapshot.revision).toBe(originalResult.snapshot.revision);

        await readerPersistence.destroy();
        reopened.destroy();
    });
});
