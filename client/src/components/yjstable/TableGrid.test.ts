import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import TableGrid from "./TableGrid.svelte";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";

describe("TableGrid column labels", () => {
    it("renders column label when provided, and preserves data-col", () => {
        const schema: ParsedTableSchema = {
            tableName: "test",
            createSql: "CREATE TABLE test (due_at DATE, is_done BOOLEAN);",
            columns: [
                { name: "due_at", kind: "date", dataType: "date", isNullable: true, isPrimaryKey: false },
                { name: "is_done", kind: "boolean", dataType: "boolean", isNullable: true, isPrimaryKey: false }
            ]
        };
        const result: TableQueryResult = {
            columns: ["due_at", "is_done"],
            rows: []
        };
        const columnLabels = {
            due_at: "Due Date",
            is_done: "" // Empty label falls back to column name
        };
        const session = {} as any; // mock
        const handles = {} as TableHandles;

        const { container } = render(TableGrid, {
            props: {
                handles,
                schema,
                query: "SELECT due_at, is_done FROM test",
                result,
                componentTypes: {},
                columnLabels,
                session
            }
        });

        const headers = container.querySelectorAll("th");
        expect(headers.length).toBe(2);

        // First header uses the label
        expect(headers[0].textContent?.trim()).toBe("Due Date");
        expect(headers[0].getAttribute("title")).toBe("due_at");
        expect(headers[0].getAttribute("data-col")).toBe("due_at");

        // Second header falls back to SQL name
        expect(headers[1].textContent?.trim()).toBe("is_done");
        expect(headers[1].getAttribute("title")).toBeNull();
        expect(headers[1].getAttribute("data-col")).toBe("is_done");
    });
});
