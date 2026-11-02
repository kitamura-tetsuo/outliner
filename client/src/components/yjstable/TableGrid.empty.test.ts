import { render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createProjectSelectSession } from "../../services/yjstable/projectSelectSession";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import TableGrid from "./TableGrid.svelte";

const sessions: ReturnType<typeof createProjectSelectSession>[] = [];
const documents: Y.Doc[] = [];
afterEach(async () => {
    for (const session of sessions.splice(0)) await session.dispose();
    for (const doc of documents.splice(0)) doc.destroy();
});

function props() {
    const doc = new Y.Doc();
    documents.push(doc);
    const tableId = createTable(doc, "test_table", "test_table");
    const session = createProjectSelectSession({ projectDoc: doc, query: "SELECT 1 AS id WHERE false" });
    sessions.push(session);
    const schema: ParsedTableSchema = {
        tableName: "test_table",
        createSql: "CREATE TABLE test_table (id uuid, col_a text);",
        columns: [
            { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
            { name: "col_a", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
        ],
    };
    return {
        handles: getTableHandles(doc, tableId)!,
        schema,
        query: "SELECT * FROM test_table",
        result: { columns: ["id", "col_a"], rows: [] as Record<string, unknown>[] },
        componentTypes: {},
        columnLabels: {},
        hiddenColumns: {},
        columnOrder: [],
        session,
        rowCreationMode: "table" as const,
    };
}

describe("TableGrid empty Table state", () => {
    it.each([{ columns: [] }, { columns: ["id", "col_a"] }])(
        "retains Add row and the empty message with columns $columns",
        async ({ columns }) => {
            const base = { ...props(), result: { columns, rows: [] } };
            const { container, getByTestId, queryByTestId, rerender } = render(TableGrid, { props: base });
            expect(getByTestId("yjs-table-add-row")).toBeDefined();
            expect(container.textContent).toContain("The table is empty.");
            expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
            if (columns.length) expect(container.querySelector('th[data-col="id"]')).not.toBeNull();
            await rerender({ ...base, schema: undefined, result: { columns: [], rows: [] } });
            expect(queryByTestId("yjs-table-add-row")).toBeNull();
            expect(container.textContent).toContain("No schema applied. Apply a schema to see rows.");
        },
    );

    it("removes the empty message when the first row arrives", async () => {
        const base = props();
        const { container, rerender } = render(TableGrid, { props: base });
        expect(container.textContent).toContain("The table is empty.");
        await rerender({ ...base, result: { columns: ["id", "col_a"], rows: [{ id: "one", col_a: "Hello" }] } });
        expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
        expect(container.textContent).not.toContain("The table is empty.");
    });

    it("keeps the loading state distinct from an empty Table", () => {
        const { container, getByTestId } = render(TableGrid, { props: { ...props(), loading: true } });
        expect(getByTestId("yjs-table-loading")).toBeDefined();
        expect(container.textContent).not.toContain("The table is empty.");
    });

    it("does not show a Table message for a zero-row Grid query", () => {
        const { container } = render(TableGrid, { props: { ...props(), rowCreationMode: "query" } });
        expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
        expect(container.textContent).not.toContain("The table is empty.");
    });
});
