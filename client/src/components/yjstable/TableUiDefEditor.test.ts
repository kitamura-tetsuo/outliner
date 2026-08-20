import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

// The Query (SELECT) field is the shared Monaco SQL editor; see SqlEditor.test.ts
// for why the runtime is faked under jsdom.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

// The demo Grid whose multiline query a single-line <input> used to corrupt.
const ROUTINE_OCCURRENCES_QUERY = "SELECT id, task_key, title, cadence, occurrence_date, done\n"
    + "FROM routine_occurrences r\n"
    + "WHERE NOT EXISTS (\n"
    + "    SELECT 1 FROM routine_occurrences later\n"
    + "    WHERE later.task_key = r.task_key\n"
    + "      AND later.occurrence_date > r.occurrence_date\n"
    + "  )\n"
    + "ORDER BY cadence, task_key";

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
    beforeEach(() => {
        fakeMonacoRegistry.reset();
    });

    describe("Query (SELECT)", () => {
        function renderQueryEditor(query: string) {
            const doc = new Y.Doc();
            const handles: TableHandles = {
                doc,
                tableId: "query-table",
                schemaText: doc.getText("schemaText"),
                uiDef: doc.getMap("uiDef"),
                data: doc.getMap("data"),
                undo: { undo: vi.fn(), redo: vi.fn() } as unknown as Y.UndoManager,
            };
            handles.uiDef.set("query", query);
            const rendered = render(TableUiDefEditor, {
                props: {
                    handles,
                    schema: undefined,
                    query,
                    componentTypes: {},
                    columnLabels: {},
                    hiddenColumns: {},
                    resultColumns: [],
                    columnOrder: [],
                },
            });
            return { ...rendered, handles };
        }

        it("loads a multiline query into the editor unchanged", async () => {
            renderQueryEditor(ROUTINE_OCCURRENCES_QUERY);
            await waitFor(() => expect(fakeMonacoRegistry.editors.length).toBe(1));
            expect(fakeMonacoRegistry.lastModel().getValue()).toBe(ROUTINE_OCCURRENCES_QUERY);
        });

        it("persists the exact SQL text on commit, keeping the r/WHERE line break", async () => {
            const { handles } = renderQueryEditor(ROUTINE_OCCURRENCES_QUERY);
            await waitFor(() => expect(fakeMonacoRegistry.editors.length).toBe(1));

            // The regression gesture: add one harmless space and leave the editor.
            const edited = ROUTINE_OCCURRENCES_QUERY.replace("ORDER BY cadence", "ORDER BY  cadence");
            fakeMonacoRegistry.lastModel().type(edited);
            fakeMonacoRegistry.lastEditor().blur();

            const stored = handles.uiDef.get("query") as string;
            expect(stored).toBe(edited);
            expect(stored).toContain("FROM routine_occurrences r\nWHERE NOT EXISTS");
            expect(stored).not.toContain("rWHERE");
        });

        it("does not write to Yjs while the query is being typed", async () => {
            const { handles } = renderQueryEditor(ROUTINE_OCCURRENCES_QUERY);
            await waitFor(() => expect(fakeMonacoRegistry.editors.length).toBe(1));

            fakeMonacoRegistry.lastModel().type("SELECT 1");

            expect(handles.uiDef.get("query")).toBe(ROUTINE_OCCURRENCES_QUERY);
        });

        it("commits pending text when the panel is closed while the editor still has focus", async () => {
            const { handles, unmount } = renderQueryEditor(ROUTINE_OCCURRENCES_QUERY);
            await waitFor(() => expect(fakeMonacoRegistry.editors.length).toBe(1));

            const edited = `${ROUTINE_OCCURRENCES_QUERY}\nLIMIT 20`;
            fakeMonacoRegistry.lastModel().type(edited);
            unmount();

            expect(handles.uiDef.get("query")).toBe(edited);
        });
    });

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
