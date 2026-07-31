import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

const mockDoc = new Y.Doc();
const mockHandles: TableHandles = {
    doc: mockDoc,
    tableId: "test-table",
    schemaText: mockDoc.getText("schemaText"),
    uiDef: mockDoc.getMap("uiDef"),
    data: mockDoc.getMap("data"),
    undo: { undo: vi.fn(), redo: vi.fn() },
};

describe("TableUiDefEditor", () => {
    it("sets and clears column labels in Yjs doc", async () => {
        const schema: ParsedTableSchema = {
            columns: [
                { name: "col_a", dataType: "text", isNullable: true, kind: "text", checkOptions: [] },
            ],
            primaryKey: ["id"],
        };

        const { getByTestId } = render(TableUiDefEditor, {
            props: {
                handles: mockHandles,
                schema,
                query: "SELECT col_a FROM test",
                componentTypes: {},
                columnLabels: {},
                columnOrder: ["col_a"],
            },
        });

        const labelInput = getByTestId("yjs-table-label-col_a");

        // Set label
        await fireEvent.change(labelInput, { target: { value: "Label A" } });

        const components = mockHandles.uiDef.get("components") as Y.Map<Y.Map<unknown>>;
        const colACfg = components.get("col_a") as Y.Map<unknown>;
        expect(colACfg.get("label")).toBe("Label A");

        // Clear label
        await fireEvent.change(labelInput, { target: { value: "   " } });
        expect(colACfg.has("label")).toBe(false);
    });
});
