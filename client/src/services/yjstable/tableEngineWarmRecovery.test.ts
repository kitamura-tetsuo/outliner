// What the warm cache must not hold on to, and what it must not take away:
// an entry whose connection never came up is rebuilt on the next visit, and a
// destruction still queued behind slower cleanup never drops the relation a
// revisit has already rebuilt.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    runWarmEvictionForTests,
    setTableEngineClockForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
    WARM_RETENTION_MS,
} from "./tableEngine";

function seedTables(projectId: string, sqlNames: string[]) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tables = sqlNames.map((sqlName) => {
        const id = createTable(projectDoc, sqlName, sqlName);
        const handles = getTableHandles(projectDoc, id)!;
        setSchemaText(handles, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, amount INTEGER)`);
        handles.uiDef.set("query", `SELECT id, amount FROM ${sqlName}`);
        addRecord(handles, { amount: 7 }, "r1");
        return { id, sqlName };
    });
    return { projectDoc, tables };
}

function relationExists(projectId: string, sqlName: string): Promise<boolean> {
    return runSelect(`SELECT 1 FROM "${projectSchemaName(projectId)}"."${sqlName}"`).then(
        () => true,
        () => false,
    );
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost.
describe("warm cache recovery", { timeout: 30000 }, () => {
    it("connects again on the next visit when the connection never came up", async () => {
        const projectId = "proj-warm-offline";
        const { projectDoc, tables } = seedTables(projectId, ["orders"]);
        let attempts = 0;
        const connect: TableDocConnector = async () => {
            attempts++;
            if (attempts === 1) throw new Error("provider unavailable");
            return { waitForInitialSync: async () => ({ synced: true }), dispose: () => {} };
        };

        const offline = createTableEngineSession({ projectDoc, projectId, connect });
        const first = await offline.acquire(tables[0].id);
        expect(first?.remoteSynced).toBe(false);
        offline.dispose();
        await waitForTableEngineIdle();

        // A failed connection is not worth keeping warm: the revisit is a
        // fresh attempt, not a reunion with an adapter that never connected.
        const retry = createTableEngineSession({ projectDoc, projectId, connect });
        try {
            const second = await retry.acquire(tables[0].id);
            expect(attempts).toBe(2);
            expect(second?.remoteSynced).toBe(true);
            expect(second!.adapter).not.toBe(first!.adapter);
            expect(await relationExists(projectId, "orders")).toBe(true);
        } finally {
            retry.dispose();
        }
    });

    it("connects again when the view closed before the connection failed", async () => {
        const projectId = "proj-warm-late-failure";
        const { projectDoc, tables } = seedTables(projectId, ["orders"]);
        let attempts = 0;
        const connect: TableDocConnector = async () => {
            attempts++;
            if (attempts === 1) throw new Error("provider unavailable");
            return { waitForInitialSync: async () => ({ synced: true }), dispose: () => {} };
        };

        // Released while the connection attempt was still in flight, so the
        // entry is warmed before the failure is even known.
        const offline = createTableEngineSession({ projectDoc, projectId, connect });
        const pending = offline.acquire(tables[0].id);
        offline.dispose();
        await pending;
        await waitForTableEngineIdle();

        const retry = createTableEngineSession({ projectDoc, projectId, connect });
        try {
            const acquired = await retry.acquire(tables[0].id);
            expect(attempts).toBe(2);
            expect(acquired?.remoteSynced).toBe(true);
        } finally {
            retry.dispose();
        }
    });

    it("does not drop a relation a revisit rebuilt while the cleanup was queued", async () => {
        const projectId = "proj-warm-requeue";
        const { projectDoc, tables } = seedTables(projectId, ["slow", "orders"]);
        let now = 5_000_000;
        setTableEngineClockForTests(() => now);

        // `slow` holds up the cleanup queue, so the eviction of `orders` is
        // still pending when the grid is reopened.
        let releaseSlowDispose: () => void = () => {};
        const slowDispose = new Promise<void>((resolve) => (releaseSlowDispose = resolve));
        const connect: TableDocConnector = async (_projectId, tableId) => ({
            waitForInitialSync: async () => ({ synced: true }),
            dispose: () => (tableId === tables[0].id ? slowDispose : undefined),
        });

        const opened = createTableEngineSession({ projectDoc, projectId, connect });
        await opened.acquire(tables[0].id);
        await opened.acquire(tables[1].id);
        opened.dispose();
        await waitForTableEngineIdle();

        now += WARM_RETENTION_MS;
        const evicting = runWarmEvictionForTests();

        const reopened = createTableEngineSession({ projectDoc, projectId, connect });
        try {
            const acquired = await reopened.acquire(tables[1].id);
            const result = await acquired!.adapter.runQueryNow();
            expect(result?.rows).toEqual([{ id: "r1", amount: 7 }]);

            releaseSlowDispose();
            await evicting;

            // The successor owns the relation now; the queued destruction of
            // its predecessor must leave it alone.
            expect(await relationExists(projectId, "orders")).toBe(true);
            expect(await acquired!.adapter.runQueryNow()).toEqual(result);
            expect(await relationExists(projectId, "slow")).toBe(false);
        } finally {
            reopened.dispose();
        }
    });
});
