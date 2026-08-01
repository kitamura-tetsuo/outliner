import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const mockDoc = new Y.Doc();
const mockHandles: TableHandles = {
    doc: mockDoc,
    tableId: "test-table",
    schemaText: mockDoc.getText("schemaText"),
    uiDef: mockDoc.getMap("uiDef"),
    data: mockDoc.getMap("data"),
    undo: { undo: vi.fn(), redo: vi.fn() } as unknown as Y.UndoManager,
};

const mockSession: RelationResolver = {
    resolveRelation: vi.fn(),
};

describe("TableGrid", () => {
    it("renders headers and body cells following columnOrder", async () => {
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

        // Use a reordered array: c, a, b (and id at the end or omitted, orderColumns will append it)
        const columnOrder = ["col_c", "col_a", "col_b"];

        const { container } = render(TableGrid, {
            props: {
                handles: mockHandles,
                schema,
                query: "SELECT id, col_a, col_b, col_c FROM test",
                result,
                componentTypes: {},
                columnLabels: { col_a: "Column A Label" },
                hiddenColumns: { col_b: true },
                columnOrder,
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

        // Remove the action column if it exists in the query result or editable layout
        // In our case, the action column doesn't have .th-label, it has .sr-only
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
        const storedOrder = mockHandles.uiDef.get("columnOrder") as Y.Array<string>;
        expect(storedOrder.toArray()).toEqual(["col_c", "id", "col_b", "col_a"]);
        expect(storedOrder.toArray().indexOf("col_b")).toBe(2);
    });
});
