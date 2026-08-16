// The warm cache is bounded: retention expires, the least recently released
// root gives way once the cache is full, and neither ever takes a relation a
// retained entry still reaches.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, getTableHandles, removeTable, setSchemaText } from "./tableDocs";
import {
    createTableEngineSession,
    hasWarmExpiryTimerForTests,
    resetTableEngineForTests,
    runWarmEvictionForTests,
    setTableEngineClockForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
    WARM_CACHE_MAX_ROOTS,
    WARM_RETENTION_MS,
} from "./tableEngine";

const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

/** A clock the test moves by hand, so retention needs no real waiting. */
function fakeClock(start = 1_000_000) {
    let now = start;
    setTableEngineClockForTests(() => now);
    return {
        advance: (ms: number) => {
            now += ms;
        },
    };
}

/** One table per name, each selecting its own rows. */
function seedTables(projectId: string, sqlNames: string[]) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tables = sqlNames.map((sqlName) => {
        const id = createTable(projectDoc, sqlName, sqlName);
        const handles = getTableHandles(projectDoc, id)!;
        setSchemaText(handles, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, amount INTEGER)`);
        handles.uiDef.set("query", `SELECT id, amount FROM ${sqlName}`);
        addRecord(handles, { amount: 1 }, "r1");
        return { id, handles, sqlName };
    });
    return { projectDoc, tables };
}

function relationExists(projectId: string, sqlName: string): Promise<boolean> {
    return runSelect(`SELECT 1 FROM "${projectSchemaName(projectId)}"."${sqlName}"`).then(
        () => true,
        () => false,
    );
}

/** Open one table in its own session and close it again, leaving it warm. */
async function visit(projectDoc: Y.Doc, projectId: string, tableId: string): Promise<void> {
    const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
    await session.acquire(tableId);
    session.dispose();
    await waitForTableEngineIdle();
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost.
describe("warm cache eviction", { timeout: 60000 }, () => {
    it("drops a relation and its connection once retention expires", async () => {
        const projectId = "proj-ttl";
        const { projectDoc, tables } = seedTables(projectId, ["orders"]);
        const clock = fakeClock();
        let disposed = 0;
        const connect: TableDocConnector = async () => ({
            waitForInitialSync: async () => ({ synced: true }),
            dispose: () => {
                disposed++;
            },
        });

        const session = createTableEngineSession({ projectDoc, projectId, connect });
        await session.acquire(tables[0].id);
        session.dispose();
        await waitForTableEngineIdle();
        expect(await relationExists(projectId, "orders")).toBe(true);

        clock.advance(WARM_RETENTION_MS);
        await runWarmEvictionForTests();

        expect(await relationExists(projectId, "orders")).toBe(false);
        expect(disposed).toBe(1);
        // Nothing is left to expire, so no timer is left armed.
        expect(hasWarmExpiryTimerForTests()).toBe(false);
    });

    it("evicts the least recently released root when the cache is full", async () => {
        const projectId = "proj-lru";
        const names = Array.from({ length: WARM_CACHE_MAX_ROOTS + 1 }, (_, i) => `t${i}`);
        const { projectDoc, tables } = seedTables(projectId, names);
        const clock = fakeClock();

        for (const table of tables) {
            await visit(projectDoc, projectId, table.id);
            // Distinct release times, so "least recently used" is unambiguous.
            clock.advance(1000);
        }

        expect(await relationExists(projectId, names[0])).toBe(false);
        expect(await relationExists(projectId, names[1])).toBe(true);
        expect(await relationExists(projectId, names[names.length - 1])).toBe(true);
    });

    it("never evicts a table a live view still shows", async () => {
        const projectId = "proj-lru-active";
        const names = Array.from({ length: WARM_CACHE_MAX_ROOTS + 2 }, (_, i) => `a${i}`);
        const { projectDoc, tables } = seedTables(projectId, names);
        const clock = fakeClock();

        // The oldest table by far, but a view keeps it open the whole time.
        const open = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        await open.acquire(tables[0].id);

        try {
            for (const table of tables.slice(1)) {
                clock.advance(1000);
                await visit(projectDoc, projectId, table.id);
            }
            // The warm set overflowed, but only warm roots gave way.
            expect(await relationExists(projectId, names[0])).toBe(true);
            expect(await relationExists(projectId, names[1])).toBe(false);
        } finally {
            open.dispose();
        }
    });

    it("keeps a relation a retained root's query still reaches", async () => {
        const projectId = "proj-deps";
        const projectDoc = new Y.Doc({ guid: projectId });
        const customersId = createTable(projectDoc, "customers", "customers");
        const customers = getTableHandles(projectDoc, customersId)!;
        setSchemaText(customers, "CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT)");
        addRecord(customers, { name: "Acme" }, "c1");

        const joinIds = ["orders", "invoices"].map((sqlName) => {
            const id = createTable(projectDoc, sqlName, sqlName);
            const handles = getTableHandles(projectDoc, id)!;
            setSchemaText(handles, `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY, customer_id TEXT)`);
            handles.uiDef.set(
                "query",
                `SELECT c.name FROM ${sqlName} t JOIN customers c ON c.id = t.customer_id`,
            );
            addRecord(handles, { customer_id: "c1" }, "x1");
            return id;
        });
        const clock = fakeClock();

        // `orders` is released; `invoices` stays open. Both queries pulled in
        // `customers`, which nobody ever acquired directly.
        const held = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const invoices = await held.acquire(joinIds[1]);
        await invoices!.adapter.runQueryNow();

        const closed = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const orders = await closed.acquire(joinIds[0]);
        await orders!.adapter.runQueryNow();
        closed.dispose();
        await waitForTableEngineIdle();
        expect(await relationExists(projectId, "customers")).toBe(true);

        // Even after `orders` expires, its dependency stays: `invoices` still
        // reaches it.
        clock.advance(WARM_RETENTION_MS);
        await runWarmEvictionForTests();
        expect(await relationExists(projectId, "orders")).toBe(false);
        expect(await relationExists(projectId, "customers")).toBe(true);

        // With the last root released and expired, the dependency goes too.
        held.dispose();
        clock.advance(WARM_RETENTION_MS);
        await runWarmEvictionForTests();
        expect(await relationExists(projectId, "invoices")).toBe(false);
        expect(await relationExists(projectId, "customers")).toBe(false);
    });

    it("drops a warm relation as soon as its table is deleted", async () => {
        const projectId = "proj-deleted";
        const { projectDoc, tables } = seedTables(projectId, ["orders"]);
        fakeClock();

        await visit(projectDoc, projectId, tables[0].id);
        expect(await relationExists(projectId, "orders")).toBe(true);

        // A relation may outlive its views, but not its table: nothing warm is
        // left to answer a later query with rows of a deleted table.
        removeTable(projectDoc, tables[0].id);
        await waitForTableEngineIdle();
        expect(await relationExists(projectId, "orders")).toBe(false);
    });

    it("hard reset destroys active and warm entries and disarms the timer", async () => {
        const projectId = "proj-reset";
        const { projectDoc, tables } = seedTables(projectId, ["warm", "active"]);
        fakeClock();

        await visit(projectDoc, projectId, tables[0].id);
        const open = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        await open.acquire(tables[1].id);
        expect(hasWarmExpiryTimerForTests()).toBe(true);

        await resetTableEngineForTests();

        expect(await relationExists(projectId, "warm")).toBe(false);
        expect(await relationExists(projectId, "active")).toBe(false);
        expect(hasWarmExpiryTimerForTests()).toBe(false);
        open.dispose();
    });
});
