import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

describe("TableUiDefEditor column labels", () => {
    it("updates Y.Map when a label is entered or cleared", async () => {
        const doc = new Y.Doc();
        const uiDef = doc.getMap("uiDef");
        const handles = {
            doc,
            uiDef,
            undo: { undo: vi.fn(), redo: vi.fn() },
        } as unknown as TableHandles;

        const schema: ParsedTableSchema = {
            tableName: "test",
            createSql: "CREATE TABLE test (due_at DATE);",
            columns: [
                { name: "due_at", kind: "date", dataType: "date", isNullable: true, isPrimaryKey: false },
            ],
        };

        const { getByTestId } = render(TableUiDefEditor, {
            props: {
                handles,
                schema,
                query: "",
                componentTypes: {},
                columnLabels: {},
            },
        });

        const input = getByTestId("yjs-table-label-due_at") as HTMLInputElement;

        // Enter a label
        await fireEvent.change(input, { target: { value: "Due Date" } });

        const components = uiDef.get("components") as Y.Map<unknown>;
        expect(components).toBeDefined();
        const dueAtCfg = components.get("due_at") as Y.Map<unknown>;
        expect(dueAtCfg.get("label")).toBe("Due Date");

        // Clear the label
        await fireEvent.change(input, { target: { value: "   " } });
        expect(dueAtCfg.has("label")).toBe(false);
    });
});
