import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { createGrid, getGridHandles } from "../../services/yjstable/gridDocs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const mockSession: RelationResolver = {
    resolveRelation: vi.fn(),
};

describe("TableGrid", () => {
    it("renders headers and body cells following columnOrder", async () => {
        // Build a real project doc so the Table and Grid are wired together
        // the way the runtime uses them.
        const doc = new (await import("yjs")).Doc();
        const tableId = createTable(doc, "test_table", "test_table");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: "SELECT id, col_a, col_b, col_c FROM test",
            columnOrder: ["col_c", "col_a", "col_b"],
        });
        const handles = getTableHandles(doc, tableId)!;
        const grid = getGridHandles(doc, gridId)!;

        const schema: ParsedTableSchema = {
            tableName: "test_table",
            createSql: "CREATE TABLE test_table (id uuid, col_a text, col_b text, col_c text);",
            columns: [
                { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
                {
                    name: "col_a",
                    dataType: "text",
                    isNullable: true,
                    isPrimaryKey: false,
                    kind: "text",
                    checkOptions: [],
                },
                {
                    name: "col_b",
                    dataType: "text",
                    isNullable: true,
                    isPrimaryKey: false,
                    kind: "text",
                    checkOptions: [],
                },
                {
                    name: "col_c",
                    dataType: "text",
                    isNullable: true,
                    isPrimaryKey: false,
                    kind: "text",
                    checkOptions: [],
                },
            ],
        };

        const result: TableQueryResult = {
            columns: ["id", "col_a", "col_b", "col_c"],
            rows: [
                { id: "1", col_a: "A1", col_b: "B1", col_c: "C1" },
            ],
        };

        const { container } = render(TableGrid, {
            props: {
                grid,
                handles,
                schema,
                query: "SELECT id, col_a, col_b, col_c FROM test",
                result,
                componentTypes: {},
                columnLabels: { col_a: "Column A Label" },
                hiddenColumns: { col_b: true },
                columnOrder: ["col_c", "col_a", "col_b"],
                session: mockSession,
            },
        });

        // The expected order according to orderColumns logic:
        // stored order columns that exist in result: "col_c", "col_a", "col_b"
        // remaining result columns not in stored order: "id"
        const expectedOrder = ["col_c", "col_a", "id"];

        const headers = Array.from(container.querySelectorAll("th[scope='col'] .th-label")).map(th =>
            th.textContent?.trim().replace(/\s+RO$/, "")
        );

        const expectedHeaders = ["col_c", "Column A Label", "id"];
        expect(headers.filter(Boolean)).toEqual(expectedHeaders);

        const ths = container.querySelectorAll("th[data-col]");
        const thA = Array.from(ths).find((th) => th.getAttribute("data-col") === "col_a");
        expect(thA?.getAttribute("title")).toBe("col_a");

        expect(container.querySelector("th[data-col='col_b']")).toBeNull();
        expect(container.querySelector("td[data-col='col_b']")).toBeNull();

        const firstRowCells = Array.from(container.querySelectorAll("tbody tr:first-child td[data-col]"));
        const dataCols = firstRowCells.map(td => td.getAttribute("data-col"));
        expect(dataCols).toEqual(expectedOrder);

        // Reordering visible columns must retain the hidden column in the full
        // persisted order, so revealing it restores its prior slot.
        await fireEvent.keyDown(container.querySelector("th[data-col='col_a']")!, {
            key: "ArrowRight",
            altKey: true,
        });
        const storedOrder = grid.entry.get("columnOrder") as string[];
        expect(storedOrder).toEqual(["col_c", "id", "col_b", "col_a"]);
        expect(storedOrder.indexOf("col_b")).toBe(2);
    });

    it("preserves row DOM nodes and focus when bare-id authority resolves after mount", async () => {
        // A saved Grid renders before its mutation authority is verified: the
        // async verdict flips `editability` from read-only to writable once
        // the query execution completes. Row DOM identity must not follow that
        // flip, or every `<tr>` is destroyed and recreated — dropping DOM
        // focus in the middle of keyboard navigation.
        const doc = new (await import("yjs")).Doc();
        const tableId = createTable(doc, "test_table", "test_table");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: "SELECT id, col_a FROM test",
            columnOrder: ["col_a"],
        });
        const handles = getTableHandles(doc, tableId)!;
        const grid = getGridHandles(doc, gridId)!;

        const schema: ParsedTableSchema = {
            tableName: "test_table",
            createSql: "CREATE TABLE test_table (id uuid, col_a text);",
            columns: [
                { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
                {
                    name: "col_a",
                    dataType: "text",
                    isNullable: true,
                    isPrimaryKey: false,
                    kind: "text",
                    checkOptions: [],
                },
            ],
        };

        const result: TableQueryResult = {
            columns: ["id", "col_a"],
            rows: [
                { id: "1", col_a: "A1" },
            ],
        };

        const baseProps = {
            grid,
            handles,
            schema,
            query: "SELECT id, col_a FROM test",
            result,
            bareIdAuthority: undefined,
            componentTypes: {},
            columnLabels: {},
            hiddenColumns: {},
            columnOrder: ["col_a"],
            session: mockSession,
        };
        const { container, rerender } = render(TableGrid, { props: baseProps });

        const row = container.querySelector("tbody tr")!;
        const button = container.querySelector<HTMLButtonElement>('tbody tr td[data-col="col_a"] button')!;
        button.focus();
        expect(document.activeElement).toBe(button);

        // Authority resolves: the grid becomes writable without touching rows.
        await rerender({
            ...baseProps,
            bareIdAuthority: { status: "compatible", editableColumns: new Set(["col_a"]) },
        });

        expect(container.querySelector("tbody tr")).toBe(row);
        expect(document.activeElement).toBe(button);
    });

    describe("rowCreationMode", () => {
        it("renders '+ Add row' in table mode when schema is present, even with empty result", async () => {
            const doc = new (await import("yjs")).Doc();
            const tableId = createTable(doc, "test_table", "test_table");
            const handles = getTableHandles(doc, tableId)!;
            const schema: ParsedTableSchema = {
                tableName: "test_table",
                createSql: "CREATE TABLE test_table (id uuid, col_a text);",
                columns: [
                    {
                        name: "id",
                        dataType: "uuid",
                        isNullable: false,
                        isPrimaryKey: true,
                        kind: "text",
                        checkOptions: [],
                    },
                    {
                        name: "col_a",
                        dataType: "text",
                        isNullable: true,
                        isPrimaryKey: false,
                        kind: "text",
                        checkOptions: [],
                    },
                ],
            };
            const result: TableQueryResult = { columns: [], rows: [] }; // No query result yet

            const { container, getByTestId, queryByTestId, rerender } = render(TableGrid, {
                props: {
                    handles,
                    schema,
                    query: "SELECT * FROM test",
                    result,
                    componentTypes: {},
                    columnLabels: {},
                    hiddenColumns: {},
                    columnOrder: [],
                    session: mockSession,
                    rowCreationMode: "table",
                },
            });

            expect(getByTestId("yjs-table-add-row")).toBeDefined();
            expect(container.textContent).toContain("The table is empty.");

            // without schema in table mode, cannot add row
            await rerender({
                handles,
                schema: undefined,
                query: "SELECT * FROM test",
                result,
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: {},
                columnOrder: [],
                session: mockSession,
                rowCreationMode: "table",
            } as unknown as Record<string, unknown>);

            expect(queryByTestId("yjs-table-add-row")).toBeNull();
            expect(container.textContent).toContain("No schema applied. Apply a schema to see rows.");
        });
    });
});
