import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import {
    createTableEngineSession,
    resetTableEngineForTests,
    type TableDocConnector,
    waitForTableEngineIdle,
} from "./tableEngine";

/** No provider in unit tests: the subdoc is already "synced" locally. */
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

function seedProject(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });

    const ordersId = createTable(projectDoc, "受注", "orders");
    const orders = getTableHandles(projectDoc, ordersId)!;
    setSchemaText(orders, "CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id TEXT, amount INTEGER)");

    const customersId = createTable(projectDoc, "顧客", "customers");
    const customers = getTableHandles(projectDoc, customersId)!;
    setSchemaText(customers, "CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT)");

    addRecord(customers, { name: "Acme" }, "c1");
    addRecord(customers, { name: "Globex" }, "c2");
    addRecord(orders, { customer_id: "c1", amount: 100 }, "o1");
    addRecord(orders, { customer_id: "c1", amount: 250 }, "o2");
    addRecord(orders, { customer_id: "c2", amount: 40 }, "o3");

    return { projectDoc, ordersId, orders, customersId, customers };
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost.
describe("cross-table aggregation", { timeout: 30000 }, () => {
    it("joins and aggregates a table that no view has opened", async () => {
        const projectId = "proj-join";
        const { projectDoc, ordersId, orders } = seedProject(projectId);
        orders.uiDef.set(
            "query",
            "SELECT c.name, SUM(o.amount) AS total FROM orders o "
                + "JOIN customers c ON c.id = o.customer_id GROUP BY c.name ORDER BY c.name",
        );

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(ordersId);
            // Only `orders` is acquired: `customers` must be pulled in by the
            // query itself, not by a mounted view.
            const result = await acquired!.adapter.runQueryNow();
            expect(result?.columns).toEqual(["name", "total"]);
            expect(result?.rows).toEqual([
                { name: "Acme", total: 350 },
                { name: "Globex", total: 40 },
            ]);
        } finally {
            session.dispose();
        }
    });

    it("reports an error instead of a partial result for an unknown relation", async () => {
        const projectId = "proj-unknown";
        const { projectDoc, ordersId, orders } = seedProject(projectId);
        orders.uiDef.set("query", "SELECT SUM(amount) FROM orders JOIN suppliers ON true");

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        let queryError: string | undefined;
        try {
            const acquired = await session.acquire(ordersId);
            acquired!.adapter.subscribe({ onQueryError: (m) => (queryError = m) });
            const result = await acquired!.adapter.runQueryNow();
            expect(result).toBeUndefined();
            expect(queryError).toMatch(/suppliers/);
        } finally {
            session.dispose();
        }
    });

    it("drops evicted tables so a later query cannot read stale rows", async () => {
        const projectId = "proj-release";
        const { projectDoc, ordersId, orders } = seedProject(projectId);
        orders.uiDef.set("query", "SELECT COUNT(*) AS n FROM orders JOIN customers ON true");

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const acquired = await session.acquire(ordersId);
        await acquired!.adapter.runQueryNow();

        const schema = projectSchemaName(projectId);
        await expect(runSelect(`SELECT * FROM "${schema}"."customers"`)).resolves.toBeDefined();

        // Closing the view only makes the entry warm: the relation survives a
        // release for a while, so revisiting the grid is cheap.
        session.dispose();
        await waitForTableEngineIdle();
        await expect(runSelect(`SELECT * FROM "${schema}"."customers"`)).resolves.toBeDefined();

        // Eviction is what drops them — the table itself and the relation its
        // query pulled in alike.
        await resetTableEngineForTests();
        await expect(runSelect(`SELECT * FROM "${schema}"."customers"`)).rejects.toThrow(/does not exist/);
        await expect(runSelect(`SELECT * FROM "${schema}"."orders"`)).rejects.toThrow(/does not exist/);
    });

    it("shares one materialization between several views of the same table", async () => {
        const projectId = "proj-shared";
        const { projectDoc, ordersId, orders } = seedProject(projectId);
        orders.uiDef.set("query", "SELECT id, amount FROM orders ORDER BY id");

        const first = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const second = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const a = await first.acquire(ordersId);
            const b = await second.acquire(ordersId);
            expect(a!.adapter).toBe(b!.adapter);

            // Closing one view must not drop the table the other still shows.
            first.dispose();
            await waitForTableEngineIdle();
            const result = await b!.adapter.runQueryNow();
            expect(result?.rows).toHaveLength(3);
        } finally {
            second.dispose();
        }
    });
});
