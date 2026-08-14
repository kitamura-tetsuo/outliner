import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { GridTableSnapshot } from "../clipboard/itemClipboard";
import { resetPgliteForTests } from "./pgliteService";
import {
    computeSnapshotClosure,
    computeTableClosure,
    copyTableData,
    exportTableStructure,
    exportTableStructures,
    importTableStructures,
} from "./tableClone";
import { addRecord, createTable, getTableHandles, listTables, setSchemaText, tableDocGuid } from "./tableDocs";

function configureUi(
    doc: Y.Doc,
    tableId: string,
    query: string,
    label = "金額 €",
): void {
    const handles = getTableHandles(doc, tableId)!;
    handles.doc.transact(() => {
        handles.uiDef.set("query", query);
        const components = new Y.Map<Y.Map<unknown>>();
        const amount = new Y.Map<unknown>();
        amount.set("type", "number");
        amount.set("label", label);
        amount.set("hidden", false);
        components.set("amount", amount);
        handles.uiDef.set("components", components);
        const order = ["amount", "id"];
        handles.uiDef.set("columnOrder", order);
    });
}

function simpleSnapshot(
    sourceTableId: string,
    sqlName: string,
    query = `SELECT id FROM ${sqlName}`,
): GridTableSnapshot {
    return {
        sourceTableId,
        name: sqlName.toUpperCase(),
        sqlName,
        schemaSql: `CREATE TABLE ${sqlName} (id TEXT PRIMARY KEY)`,
        ui: { query, components: {}, columnOrder: ["id"] },
    };
}

function sourceProject(): {
    doc: Y.Doc;
    ordersId: string;
    customersId: string;
} {
    const doc = new Y.Doc({ guid: "source-project" });
    const ordersId = createTable(doc, "受注", "orders");
    const orders = getTableHandles(doc, ordersId)!;
    setSchemaText(
        orders,
        "CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id TEXT, amount INTEGER)",
    );
    configureUi(
        doc,
        ordersId,
        "SELECT 'orders' AS source_kind, o.id AS source_id, o.amount, c.name "
            + "FROM orders o JOIN customers c ON c.id = o.customer_id",
    );
    addRecord(orders, { customer_id: "c1", amount: 42 }, "o1");

    const customersId = createTable(doc, "顧客", "customers");
    const customers = getTableHandles(doc, customersId)!;
    setSchemaText(customers, "CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT)");
    customers.uiDef.set("query", "SELECT id, name FROM customers");
    addRecord(customers, { name: "Acme" }, "c1");
    return { doc, ordersId, customersId };
}

afterAll(async () => {
    await resetPgliteForTests();
});

describe("table structure export", () => {
    it("exports schema and explicit UI only, never Data Storage or Yjs objects", () => {
        const { doc, ordersId } = sourceProject();
        const snapshot = exportTableStructure(doc, ordersId);

        expect(snapshot).toEqual({
            sourceTableId: ordersId,
            name: "受注",
            sqlName: "orders",
            schemaSql: "CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id TEXT, amount INTEGER)",
            ui: {
                query: "SELECT 'orders' AS source_kind, o.id AS source_id, o.amount, c.name "
                    + "FROM orders o JOIN customers c ON c.id = o.customer_id",
                components: { amount: { type: "number", label: "金額 €", hidden: false } },
                columnOrder: ["amount", "id"],
            },
        });
        expect("data" in snapshot).toBe(false);
        expect(snapshot.ui.components).not.toBeInstanceOf(Y.Map);
        expect(Array.isArray(snapshot.ui.columnOrder)).toBe(true);
    });

    it("deduplicates table IDs during batch export", () => {
        const { doc, ordersId } = sourceProject();
        expect(Object.keys(exportTableStructures(doc, [ordersId, ordersId]))).toEqual([ordersId]);
    });
});

describe("computeTableClosure", () => {
    it("finds the closure of a chain of dependencies", () => {
        const doc = new Y.Doc();
        const tableA = createTable(doc, "Table A", "table_a", undefined, handles => {
            handles.uiDef.set("query", "SELECT * FROM table_b");
        });
        const entryA = new Y.Map();
        entryA.set("sqlName", "table_a");
        entryA.set("tableId", tableA);
        doc.getMap("tableRegistry").set(tableA, entryA);
        const tableB = createTable(doc, "Table B", "table_b", undefined, handles => {
            handles.uiDef.set("query", "SELECT * FROM table_c");
        });
        const entryB = new Y.Map();
        entryB.set("sqlName", "table_b");
        entryB.set("tableId", tableB);
        doc.getMap("tableRegistry").set(tableB, entryB);
        const tableC = createTable(doc, "Table C", "table_c", undefined, handles => {
            handles.uiDef.set("query", "SELECT * FROM something_else");
        });
        const entryC = new Y.Map();
        entryC.set("sqlName", "table_c");
        entryC.set("tableId", tableC);
        doc.getMap("tableRegistry").set(tableC, entryC);

        const closure = computeTableClosure(doc, [tableA]);
        expect(closure.has(tableA)).toBe(true);
        expect(closure.has(tableB)).toBe(true);
        expect(closure.has(tableC)).toBe(true);
        expect(closure.size).toBe(3);
    });

    it("handles cycles gracefully", () => {
        const doc = new Y.Doc();
        const tableA = createTable(doc, "Table A", "table_a", undefined, handles => {
            handles.uiDef.set("query", "SELECT * FROM table_b");
        });
        const entryA2 = new Y.Map();
        entryA2.set("sqlName", "table_a");
        entryA2.set("tableId", tableA);
        doc.getMap("tableRegistry").set(tableA, entryA2);
        const tableB = createTable(doc, "Table B", "table_b", undefined, handles => {
            handles.uiDef.set("query", "SELECT * FROM table_a");
        });
        const entryB2 = new Y.Map();
        entryB2.set("sqlName", "table_b");
        entryB2.set("tableId", tableB);
        doc.getMap("tableRegistry").set(tableB, entryB2);

        const closure = computeTableClosure(doc, [tableA]);
        expect(closure.has(tableA)).toBe(true);
        expect(closure.has(tableB)).toBe(true);
        expect(closure.size).toBe(2);
    });

    it("ignores unresolvable dependencies", () => {
        const doc = new Y.Doc();
        const tableA = createTable(doc, "Table A", "table_a", undefined, handles => {
            handles.uiDef.set("query", "SELECT * FROM table_non_existent");
        });
        const entryA3 = new Y.Map();
        entryA3.set("sqlName", "table_a");
        entryA3.set("tableId", tableA);
        doc.getMap("tableRegistry").set(tableA, entryA3);

        const closure = computeTableClosure(doc, [tableA]);
        expect(closure.has(tableA)).toBe(true);
        expect(closure.size).toBe(1);
    });
});

describe("computeSnapshotClosure", () => {
    it("keeps transitive portable dependencies and rejects unrelated snapshots", () => {
        const snapshots = {
            host: simpleSnapshot("host", "host", "SELECT * FROM dependency"),
            dependency: simpleSnapshot("dependency", "dependency"),
            unrelated: simpleSnapshot("unrelated", "unrelated"),
        };

        expect([...computeSnapshotClosure(snapshots, ["host"])]).toEqual(["host", "dependency"]);
    });
});

describe("table structure import", { timeout: 30000 }, () => {
    it("creates fresh destination tables, rewrites conflicts and cross-table references, and keeps data empty", async () => {
        const source = sourceProject();
        const snapshots = exportTableStructures(source.doc, [source.ordersId, source.customersId]);
        const destination = new Y.Doc({ guid: "destination-project" });
        createTable(destination, "Existing orders", "orders", undefined, handles => {
            handles.schemaText.insert(0, "CREATE TABLE orders (id TEXT PRIMARY KEY)");
        });

        const result = await importTableStructures(
            destination,
            snapshots,
            "source-project",
            new Set([source.ordersId]),
        );
        expect(result.failures).toEqual({});
        expect(Object.keys(result.tableIdMap).sort()).toEqual([source.customersId, source.ordersId].sort());

        const destinationOrdersId = result.tableIdMap[source.ordersId];
        const destinationCustomersId = result.tableIdMap[source.customersId];
        const destinationOrders = getTableHandles(destination, destinationOrdersId)!;
        const destinationCustomers = getTableHandles(destination, destinationCustomersId)!;

        expect(destinationOrdersId).not.toBe(source.ordersId);
        expect(destinationCustomersId).not.toBe(source.customersId);
        expect(destinationOrders.doc.guid).toBe(tableDocGuid("destination-project", destinationOrdersId));
        expect(destinationOrders.schemaText.toString()).toContain("CREATE TABLE orders_2");
        expect(destinationCustomers.schemaText.toString()).toContain("CREATE TABLE customers");
        expect(destinationOrders.uiDef.get("query")).toBe(
            "SELECT 'orders_2' AS source_kind, o.id AS source_id, o.amount, c.name "
                + "FROM orders_2 o JOIN customers c ON c.id = o.customer_id",
        );
        expect(destinationOrders.data.size).toBe(0);
        expect(destinationCustomers.data.size).toBe(0);
        expect(listTables(destination).find(table => table.tableId === destinationOrdersId)?.sqlName).toBe("orders_2");
        expect(
            result.outcomes.filter(outcome => outcome.type !== "cloned").sort((a, b) => a.type.localeCompare(b.type)),
        ).toEqual([
            { type: "dependency-added", sourceTableId: source.customersId, tableName: "顧客" },
            { type: "renamed", sourceTableId: source.ordersId, tableName: "受注", from: "orders", to: "orders_2" },
        ]);
    });

    it("materializes independent Y.Map/Y.Array values and remains independent in both directions", async () => {
        const source = sourceProject();
        const snapshot = exportTableStructure(source.doc, source.ordersId);
        snapshot.ui.query = "SELECT id, amount FROM orders";
        const destination = new Y.Doc({ guid: "destination-independent" });
        const result = await importTableStructures(destination, { [source.ordersId]: snapshot }, "source-project");
        const sourceHandles = getTableHandles(source.doc, source.ordersId)!;
        const destinationHandles = getTableHandles(destination, result.tableIdMap[source.ordersId])!;
        const sourceComponents = sourceHandles.uiDef.get("components") as Y.Map<Y.Map<unknown>>;
        const destinationComponents = destinationHandles.uiDef.get("components") as Y.Map<Y.Map<unknown>>;
        const sourceOrder = sourceHandles.uiDef.get("columnOrder") as string[];
        const destinationOrder = destinationHandles.uiDef.get("columnOrder") as string[];

        expect(destinationComponents).not.toBe(sourceComponents);
        expect(destinationComponents.get("amount")).not.toBe(sourceComponents.get("amount"));
        expect(destinationOrder).not.toBe(sourceOrder);

        sourceComponents.get("amount")!.set("label", "source changed");
        sourceHandles.uiDef.set("columnOrder", [...sourceOrder, "customer_id"]);
        expect(destinationComponents.get("amount")!.get("label")).toBe("金額 €");
        expect(destinationOrder).toEqual(["amount", "id"]);

        destinationHandles.uiDef.set("query", "SELECT amount FROM orders");
        destinationComponents.get("amount")!.set("label", "destination changed");
        expect(sourceHandles.uiDef.get("query")).toContain("JOIN customers");
        expect(sourceComponents.get("amount")!.get("label")).toBe("source changed");
    });

    it("skips cloning a table if a table with the same provenance already exists", async () => {
        const destination = new Y.Doc({ guid: "destination-repeat-provenance" });
        const snapshot = simpleSnapshot("source-one", "tasks");

        const first = await importTableStructures(destination, { "source-one": snapshot }, "source-project");
        const second = await importTableStructures(destination, { "source-one": snapshot }, "source-project");

        expect(Object.keys(first.tableIdMap)).toEqual(["source-one"]);
        // The second import skips it, so no tableIdMap entry is returned for "source-one"
        expect(Object.keys(second.tableIdMap)).toEqual([]);

        // And the table is only created once
        expect(listTables(destination).map(table => table.sqlName)).toEqual(["tasks"]);
        expect(second.outcomes).toEqual([
            { type: "reuse-offered", sourceTableId: "source-one", tableName: "TASKS" },
        ]);
    });

    it("imports one table per source snapshot in one call and fresh tables in a later call", async () => {
        const destination = new Y.Doc({ guid: "destination-repeat" });
        const snapshot = simpleSnapshot("source-one", "tasks");

        const first = await importTableStructures(destination, { "source-one": snapshot }, undefined);
        const second = await importTableStructures(destination, { "source-one": snapshot }, undefined);

        expect(Object.keys(first.tableIdMap)).toEqual(["source-one"]);
        expect(Object.keys(second.tableIdMap)).toEqual(["source-one"]);
        expect(first.tableIdMap["source-one"]).not.toBe(second.tableIdMap["source-one"]);
        expect(listTables(destination).map(table => table.sqlName)).toEqual(["tasks", "tasks_2"]);
    });

    it("validates outline_items in the scratch schema", async () => {
        const destination = new Y.Doc({ guid: "destination-items" });
        const snapshot = simpleSnapshot(
            "calendar-host",
            "events",
            "SELECT e.id, i.text FROM events e LEFT JOIN outline_items i ON i.id = e.id",
        );

        const result = await importTableStructures(destination, { "calendar-host": snapshot }, "source-project");
        expect(result.failures).toEqual({});
        expect(result.tableIdMap["calendar-host"]).toBeDefined();
        expect(result.outcomes).toContainEqual({
            type: "rebound",
            sourceTableId: "calendar-host",
            tableName: "EVENTS",
            relation: "outline_items",
        });
    });

    it("skips a failed dependency group while cloning an independent valid table", async () => {
        const destination = new Y.Doc({ guid: "destination-partial" });
        const host = simpleSnapshot("host", "host", "SELECT * FROM host JOIN broken ON true");
        const broken = {
            ...simpleSnapshot("broken", "broken"),
            schemaSql: "CREATE TABLE wrong_name (id TEXT)",
        };
        const independent = simpleSnapshot("independent", "independent");

        const result = await importTableStructures(destination, { host, broken, independent }, "source-project");

        expect(result.tableIdMap.independent).toBeDefined();
        expect(result.tableIdMap.host).toBeUndefined();
        expect(result.tableIdMap.broken).toBeUndefined();
        expect(result.failedSourceTableIds).toEqual(["broken", "host"]);
        expect(result.failures.host).toMatch(/expected source relation/);
        expect(listTables(destination)).toHaveLength(1);
        expect(listTables(destination)[0].sqlName).toBe("independent");
        expect(result.outcomes).toContainEqual({
            type: "failed-group",
            sourceTableIds: ["broken", "host"],
            tableNames: ["BROKEN", "HOST"],
            reason: result.failures.host,
        });
    });

    it("rejects an absent source relation without leaving registry debris", async () => {
        const destination = new Y.Doc({ guid: "destination-missing" });
        const snapshot = simpleSnapshot("host", "host", "SELECT * FROM host JOIN not_copied ON true");

        const result = await importTableStructures(destination, { host: snapshot }, "source-project");

        expect(result.tableIdMap).toEqual({});
        expect(result.failures.host).toMatch(/absent from the clipboard/);
        expect(listTables(destination)).toEqual([]);
        expect([...destination.getSubdocs()]).toEqual([]);
    });
});

describe("copyTableData", () => {
    it("copies records with fresh nested maps and keeps both tables independent", () => {
        const source = sourceProject();
        const destinationDoc = new Y.Doc({ guid: "destination-data" });
        const destinationId = createTable(destinationDoc, "Orders", "orders");
        const sourceHandles = getTableHandles(source.doc, source.ordersId)!;
        const destinationHandles = getTableHandles(destinationDoc, destinationId)!;

        copyTableData(sourceHandles, destinationHandles);

        expect(destinationHandles.data.toJSON()).toEqual(sourceHandles.data.toJSON());
        expect(destinationHandles.data.get("o1")).not.toBe(sourceHandles.data.get("o1"));
        sourceHandles.data.get("o1")!.set("amount", 99);
        expect(destinationHandles.data.get("o1")!.get("amount")).toBe(42);
        destinationHandles.data.get("o1")!.set("amount", 7);
        expect(sourceHandles.data.get("o1")!.get("amount")).toBe(99);
    });

    it("treats a reachable empty source as a successful empty snapshot", () => {
        const sourceDoc = new Y.Doc({ guid: "source-empty" });
        const destinationDoc = new Y.Doc({ guid: "destination-empty" });
        const source = getTableHandles(sourceDoc, createTable(sourceDoc, "Empty", "empty"))!;
        const destination = getTableHandles(destinationDoc, createTable(destinationDoc, "Empty", "empty"))!;
        addRecord(destination, { value: "stale" }, "stale");

        copyTableData(source, destination);

        expect(destination.data.size).toBe(0);
    });
});
