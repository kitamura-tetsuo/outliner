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
    undo: { undo: vi.fn(), redo: vi.fn() } as unknown as Y.UndoManager,
};

describe("TableUiDefEditor", () => {
    it("sets and clears column labels in Yjs doc", async () => {
        const schema: ParsedTableSchema = {
            tableName: "test",
            createSql: "CREATE TABLE test (col_a text);",
            columns: [
                {
                    name: "col_a",
                    dataType: "text",
                    isNullable: true,
                    kind: "text",
                    checkOptions: [],
                    isPrimaryKey: false,
                },
            ],
        };

        const { getByTestId } = render(TableUiDefEditor, {
            props: {
                handles: mockHandles,
                schema,
                query: "SELECT col_a FROM test",
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: {},
                resultColumns: ["col_a"],
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

    it("stores only true hidden values and removes an empty column config", async () => {
        const schema: ParsedTableSchema = {
            tableName: "test",
            createSql: "CREATE TABLE test (col_a text);",
            columns: [{
                name: "col_a",
                dataType: "text",
                isNullable: true,
                kind: "text",
                checkOptions: [],
                isPrimaryKey: false,
            }],
        };
        const doc = new Y.Doc();
        const handles: TableHandles = {
            doc,
            tableId: "hidden-test-table",
            schemaText: doc.getText("schemaText"),
            uiDef: doc.getMap("uiDef"),
            data: doc.getMap("data"),
            undo: { undo: vi.fn(), redo: vi.fn() } as unknown as Y.UndoManager,
        };
        const { getByTestId } = render(TableUiDefEditor, {
            props: {
                handles,
                schema,
                query: "SELECT col_a FROM test",
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: {},
                resultColumns: ["col_a"],
                columnOrder: ["col_a"],
            },
        });
        const checkbox = getByTestId("yjs-table-hidden-col_a");

        await fireEvent.click(checkbox);
        const components = handles.uiDef.get("components") as Y.Map<Y.Map<unknown>>;
        expect(components.get("col_a")?.get("hidden")).toBe(true);

        await fireEvent.click(checkbox);
        expect(components.has("col_a")).toBe(false);
    });

    it("offers visibility controls for computed query columns outside the schema", async () => {
        const doc = new Y.Doc();
        const handles: TableHandles = {
            doc,
            tableId: "computed-column-table",
            schemaText: doc.getText("schemaText"),
            uiDef: doc.getMap("uiDef"),
            data: doc.getMap("data"),
            undo: { undo: vi.fn(), redo: vi.fn() } as unknown as Y.UndoManager,
        };
        const { getByTestId, getByText } = render(TableUiDefEditor, {
            props: {
                handles,
                schema: undefined,
                query: "SELECT revenue * 2 AS doubled FROM sales",
                componentTypes: {},
                columnLabels: {},
                hiddenColumns: {},
                resultColumns: ["doubled"],
                columnOrder: [],
            },
        });

        expect(getByText("query result")).toBeTruthy();
        await fireEvent.click(getByTestId("yjs-table-hidden-doubled"));
        const components = handles.uiDef.get("components") as Y.Map<Y.Map<unknown>>;
        expect(components.get("doubled")?.get("hidden")).toBe(true);
    });
});
