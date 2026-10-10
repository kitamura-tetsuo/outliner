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

function typedProject(projectId: string, labels: string[]) {
    const doc = new Y.Doc({ guid: projectId });
    const catalogDoc = doc as unknown as Parameters<typeof createSqlCatalogObject>[0];
    const catalogId = createSqlCatalogObject(
        catalogDoc,
        "enum",
        `CREATE TYPE shared_state AS ENUM (${labels.map(label => `'${label}'`).join(", ")})`,
    );
    const tableId = createTable(doc, "Tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, state shared_state)");
    addRecord(handles, { state: labels[0] }, "r1");
    return { doc, catalogDoc, catalogId, tableId, handles };
}

describe("catalog lifecycle orderings", { timeout: 90_000 }, () => {
    it("discards an older in-flight definition and keeps the successor schema published", async () => {
        const fixture = typedProject("catalog-overlap", ["Initial"]);
        const session = createTableEngineSession({
            projectDoc: fixture.doc,
            projectId: fixture.doc.guid,
            connect: localConnector,
        });
        try {
            const acquired = await session.acquire(fixture.tableId);
            const published: string[][] = [];
            acquired!.adapter.subscribe({
                onSchemaChanged: schema => {
                    const labels = schema?.columns[1]?.enumLabels;
                    if (labels) published.push(labels);
                },
            });
            replaceSqlCatalogSource(
                fixture.catalogDoc,
                fixture.catalogId,
                "CREATE TYPE shared_state AS ENUM ('A', 'Initial')",
            );
            // The first compiler has yielded before this synchronous mutation;
            // B therefore supersedes an already-started A build.
            replaceSqlCatalogSource(
                fixture.catalogDoc,
                fixture.catalogId,
                "CREATE TYPE shared_state AS ENUM ('Initial', 'B')",
            );
            await expect.poll(
                () => acquired!.adapter.appliedSchema?.columns[1]?.enumLabels,
                { timeout: 60_000 },
            ).toEqual(["Initial", "B"]);
            expect(published).not.toContainEqual(["A", "Initial"]);
        } finally {
            session.dispose();
        }
    });

    it("shares two views, reconstructs after eviction, and isolates equal type names between Projects", async () => {
        const first = typedProject("catalog-lifecycle-a", ["A1", "A2"]);
        const second = typedProject("catalog-lifecycle-b", ["B2", "B1"]);
        const viewA = createTableEngineSession({
            projectDoc: first.doc,
            projectId: first.doc.guid,
            connect: localConnector,
        });
        const viewB = createTableEngineSession({
            projectDoc: first.doc,
            projectId: first.doc.guid,
            connect: localConnector,
        });
        const other = createTableEngineSession({
            projectDoc: second.doc,
            projectId: second.doc.guid,
            connect: localConnector,
        });
        const acquiredA = await viewA.acquire(first.tableId);
        const acquiredB = await viewB.acquire(first.tableId);
        const acquiredOther = await other.acquire(second.tableId);
        expect(acquiredA!.adapter).toBe(acquiredB!.adapter);
        expect(acquiredOther!.adapter.appliedSchema?.columns[1]?.enumLabels).toEqual(["B2", "B1"]);
        viewA.dispose();
        expect((await acquiredB!.adapter.runQueryNow("SELECT state FROM tasks ORDER BY state"))?.rows)
            .toEqual([{ state: "A1" }]);
        viewB.dispose();
        other.dispose();

        await resetTableEngineForTests();
        const reopened = createTableEngineSession({
            projectDoc: first.doc,
            projectId: first.doc.guid,
            connect: localConnector,
        });
        try {
            const cold = await reopened.acquire(first.tableId);
            expect(cold!.adapter.appliedSchema?.columns[1]?.enumLabels).toEqual(["A1", "A2"]);
            expect(first.handles.data.get("r1")?.get("state")).toBe("A1");
        } finally {
            reopened.dispose();
        }
    });

    it("leaves catalog-free built-in scalar Tables on the legacy path", async () => {
        const doc = new Y.Doc({ guid: "catalog-legacy" });
        const tableId = createTable(doc, "Legacy", "legacy");
        const handles = getTableHandles(doc, tableId)!;
        setSchemaText(handles, "CREATE TABLE legacy (id TEXT PRIMARY KEY, points INTEGER)");
        addRecord(handles, { points: 7 }, "r1");
        const session = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect: localConnector });
        try {
            const acquired = await session.acquire(tableId);
            expect((await acquired!.adapter.runQueryNow("SELECT points FROM legacy"))?.rows).toEqual([{ points: 7 }]);
        } finally {
            session.dispose();
        }
    });
});
