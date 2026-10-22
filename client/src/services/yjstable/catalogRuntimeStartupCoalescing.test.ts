import { createSqlCatalogObject } from "$shared/services/sqlCatalog";
import * as compiler from "$shared/services/sqlEnvironmentCompiler";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { resetPgliteForTests } from "./pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(async () => {
    vi.restoreAllMocks();
    await resetTableEngineForTests();
});
afterAll(resetPgliteForTests);

it("compiles only the final captured catalog for synchronous Table registrations", async () => {
    const projectDoc = new Y.Doc({ guid: "catalog-startup-coalescing" });
    createSqlCatalogObject(
        projectDoc as unknown as Parameters<typeof createSqlCatalogObject>[0],
        "enum",
        "CREATE TYPE priority AS ENUM ('Low', 'High')",
    );
    const ids: string[] = [];
    for (let index = 0; index < 8; index++) {
        const name = `bench_${index}`;
        const id = createTable(projectDoc, name, name);
        const handles = getTableHandles(projectDoc, id)!;
        setSchemaText(handles, `CREATE TABLE ${name} (id TEXT PRIMARY KEY, value TEXT)`);
        addRecord(handles, { value: String(index) }, `row-${index}`);
        ids.push(id);
    }

    // Pass through to the real compiler while counting redundant invocations.
    const compileSpy = vi.spyOn(compiler, "compileSqlEnvironment");
    const session = createTableEngineSession({ projectDoc, projectId: projectDoc.guid, connect: localConnector });
    const observed: string[] = [];
    const unsubscribe = session.subscribeCatalog(state => observed.push(state.status));
    try {
        const acquired = await Promise.all(ids.map(id => session.acquire(id)));
        await session.catalogReady();
        expect(acquired.every(Boolean)).toBe(true);
        expect(observed.at(-1)).toBe("ready");
        expect(compileSpy).toHaveBeenCalledTimes(1);
        await expect(acquired[7]?.adapter.runQueryNow("SELECT value FROM bench_7")).resolves.toEqual({
            columns: ["value"],
            rows: [{ value: "7" }],
        });
    } finally {
        unsubscribe();
        session.dispose();
    }
}, 120_000);
