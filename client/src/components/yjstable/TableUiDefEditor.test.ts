import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

function createMockHandles(): TableHandles {
    const doc = new Y.Doc();
    return {
        tableId: "table1",
        doc,
        uiDef: doc.getMap("uiDef"),
        data: doc.getArray("data"),
        undo: new Y.UndoManager(doc.getMap("uiDef")),
    };
}

const mockSchema: ParsedTableSchema = {
    tableName: "tasks",
    columns: [
        { name: "id", kind: "integer", dataType: "INTEGER" },
        { name: "title", kind: "text", dataType: "TEXT" },
        { name: "status", kind: "text", dataType: "TEXT", checkOptions: ["todo", "done"] },
    ],
    pkColumns: ["id"],
};

describe("TableUiDefEditor", () => {
    it("renders rows based on resultColumns in order", () => {
        const handles = createMockHandles();
        render(TableUiDefEditor, {
            handles,
            schema: mockSchema,
            query: "SELECT status, id FROM tasks",
            componentTypes: {},
            resultColumns: ["status", "id"],
            queryError: undefined,
        });

        // The query selects status then id
        const rows = screen.getAllByTestId(/^yjs-table-component-/);
        expect(rows).toHaveLength(2);

        // Check order
        expect(rows[0].getAttribute("data-testid")).toBe("yjs-table-component-status");
        expect(rows[1].getAttribute("data-testid")).toBe("yjs-table-component-id");

        // No row for title
        expect(screen.queryByTestId("yjs-table-component-title")).toBeNull();
    });

    it("renders 'expression' and auto(text) for aliased/calculated columns without schema definition", () => {
        const handles = createMockHandles();
        render(TableUiDefEditor, {
            handles,
            schema: mockSchema,
            query: "SELECT id, price * qty AS amount FROM tasks",
            componentTypes: {},
            resultColumns: ["id", "amount"],
            queryError: undefined,
        });

        expect(screen.getByTestId("yjs-table-component-id")).toBeInTheDocument();
        const amountSelect = screen.getByTestId("yjs-table-component-amount");
        expect(amountSelect).toBeInTheDocument();

        // Default option should be auto (text)
        const autoOption = amountSelect.querySelector('option[value="auto"]');
        expect(autoOption?.textContent).toBe("auto (text)");

        // Type label should be 'expression'
        const row = amountSelect.closest(".component-row");
        expect(row?.querySelector(".column-type")?.textContent).toBe("expression");
    });

    it("updates when resultColumns changes", async () => {
        const handles = createMockHandles();
        const { rerender } = render(TableUiDefEditor, {
            handles,
            schema: mockSchema,
            query: "SELECT id FROM tasks",
            componentTypes: {},
            resultColumns: ["id"],
            queryError: undefined,
        });

        expect(screen.getByTestId("yjs-table-component-id")).toBeInTheDocument();
        expect(screen.queryByTestId("yjs-table-component-title")).toBeNull();

        // Simulate query change providing new result columns
        await rerender({
            handles,
            schema: mockSchema,
            query: "SELECT id FROM tasks",
            componentTypes: {},
            resultColumns: ["id", "title"],
            queryError: undefined,
        });

        expect(screen.getByTestId("yjs-table-component-title")).toBeInTheDocument();
    });

    it("writes to components Y.Map when a type is selected and clears on auto", async () => {
        const handles = createMockHandles();
        render(TableUiDefEditor, {
            handles,
            schema: mockSchema,
            query: "SELECT id, title FROM tasks",
            componentTypes: {},
            resultColumns: ["id", "title"],
            queryError: undefined,
        });

        const titleSelect = screen.getByTestId("yjs-table-component-title");
        await fireEvent.change(titleSelect, { target: { value: "checkbox" } });

        const components = handles.uiDef.get("components") as Y.Map<unknown>;
        expect(components).toBeDefined();

        const titleConfig = components.get("title") as Y.Map<unknown>;
        expect(titleConfig.get("type")).toBe("checkbox");

        await fireEvent.change(titleSelect, { target: { value: "auto" } });
        expect(components.has("title")).toBe(false);
    });

    it("shows stale configurations and clears them", async () => {
        const handles = createMockHandles();
        // Setup initial stale config manually
        const componentsMap = new Y.Map();
        const statusCfg = new Y.Map();
        statusCfg.set("type", "checkbox");
        componentsMap.set("status", statusCfg);
        handles.uiDef.set("components", componentsMap);

        render(TableUiDefEditor, {
            handles,
            schema: mockSchema,
            query: "SELECT id FROM tasks",
            componentTypes: { status: "checkbox" }, // status is configured but not in resultColumns
            resultColumns: ["id"],
            queryError: undefined,
        });

        const staleRow = screen.getByText("status", { selector: ".stale-name" });
        expect(staleRow).toBeInTheDocument();

        const clearBtn = screen.getByTestId("yjs-table-clear-stale-status");
        await fireEvent.click(clearBtn);

        // Should clear the underlying map
        expect(componentsMap.has("status")).toBe(false);
    });

    it("displays appropriate hint on empty results", () => {
        const handles = createMockHandles();
        render(TableUiDefEditor, {
            handles,
            schema: mockSchema,
            query: "SELECT id FROM empty",
            componentTypes: {},
            resultColumns: [],
            queryError: undefined,
        });

        expect(screen.getByText("Set a SELECT query to configure cell components.")).toBeInTheDocument();
    });

    it("displays error hint on query error", () => {
        const handles = createMockHandles();
        render(TableUiDefEditor, {
            handles,
            schema: mockSchema,
            query: "SELECT id FROM empty",
            componentTypes: {},
            resultColumns: [],
            queryError: "Syntax error",
        });

        expect(screen.getByText("The query failed; components follow the last successful result.")).toBeInTheDocument();
    });
});
