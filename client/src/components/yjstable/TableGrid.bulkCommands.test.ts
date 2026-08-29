// Selection-aware bulk Grid editing commands (FTR-5191): Delete/Backspace
// clears writable cells for a cell/range/column/select-all selection, but
// removes records for a `rows`-kind selection (honoring the per-Grid
// "confirm before deleting rows" option, including from the keyboard).

import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord, createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: "CREATE TABLE tasks (id uuid, name text, done boolean, status text);",
    columns: [
        { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "name", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
        { name: "done", dataType: "boolean", isNullable: true, isPrimaryKey: false, kind: "boolean", checkOptions: [] },
        {
            name: "status",
            dataType: "text",
            isNullable: true,
            isPrimaryKey: false,
            kind: "text",
            checkOptions: ["Open", "Done"],
        },
    ],
};
const session: RelationResolver = { resolveRelation: vi.fn() };

function setup(options: { confirmRowDelete?: boolean; extraColumn?: boolean; } = {}) {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    addRecord(handles, { name: "Alpha", done: false, status: "Open" }, "a");
    addRecord(handles, { name: "Beta", done: false, status: "Open" }, "b");
    addRecord(handles, { name: "Gamma", done: false, status: "Open" }, "c");
    const columns = options.extraColumn ? ["id", "name", "done", "status", "total"] : ["id", "name", "done", "status"];
    const extra = options.extraColumn ? { total: 3 } : {};
    const result: TableQueryResult = {
        columns,
        rows: [
            { id: "a", name: "Alpha", done: false, status: "Open", ...extra },
            { id: "b", name: "Beta", done: false, status: "Open", ...extra },
            { id: "c", name: "Gamma", done: false, status: "Open", ...extra },
        ],
    };
    const props = {
        handles,
        schema,
        query: "SELECT id, name, done, status FROM tasks",
        result,
        componentTypes: { status: "select" },
        columnLabels: {},
        hiddenColumns: { id: true },
        columnOrder: options.extraColumn ? ["name", "done", "status", "total"] : ["name", "done", "status"],
        session,
        confirmRowDelete: options.confirmRowDelete ?? false,
    };
    return { doc, handles, view: render(TableGrid, { props }) };
}

function cellTd(container: HTMLElement, rowId: string, column: string): HTMLElement {
    return container.querySelector<HTMLElement>(`td[data-row-id="${rowId}"][data-col="${column}"]`)!;
}

describe("Grid selection-aware Delete/Backspace (FTR-5191)", () => {
    it("clears writable cell contents to NULL for a cell/range selection, without removing the record", async () => {
        const { handles, view } = setup();
        await fireEvent.click(cellTd(view.container, "a", "name"));
        await fireEvent.click(cellTd(view.container, "b", "name"), { shiftKey: true });

        await fireEvent.keyDown(cellTd(view.container, "b", "name").querySelector("button")!, { key: "Delete" });

        expect(handles.data.has("a")).toBe(true);
        expect(handles.data.has("b")).toBe(true);
        expect(handles.data.get("a")?.get("name")).toBe(null);
        expect(handles.data.get("b")?.get("name")).toBe(null);
        expect(handles.data.get("a")?.get("status")).toBe("Open"); // untouched
    });

    it("clears an entire selected column to NULL with Backspace", async () => {
        const { handles, view } = setup();
        const statusHeader = view.getByRole("columnheader", { name: "status" });
        await fireEvent.click(statusHeader);

        await fireEvent.keyDown(statusHeader, { key: "Backspace" });

        expect(handles.data.get("a")?.get("status")).toBe(null);
        expect(handles.data.get("b")?.get("status")).toBe(null);
        expect(handles.data.get("c")?.get("status")).toBe(null);
        expect(handles.data.get("a")?.get("name")).toBe("Alpha"); // untouched
    });

    it("removes records for a rows-kind selection when no confirmation is configured", async () => {
        const { handles, view } = setup({ confirmRowDelete: false });
        const rowA = view.getByRole("rowheader", { name: "Select row 1" });
        const rowC = view.getByRole("rowheader", { name: "Select row 3" });
        await fireEvent.click(rowA);
        await fireEvent.click(rowC, { ctrlKey: true });

        await fireEvent.keyDown(rowC, { key: "Delete" });

        expect(handles.data.has("a")).toBe(false);
        expect(handles.data.has("c")).toBe(false);
        expect(handles.data.has("b")).toBe(true);
    });

    it("never turns a select-all (whole-result) selection into a destructive row removal", async () => {
        const { handles, view } = setup();
        const corner = view.getByRole("columnheader", { name: "Select current query result" });
        await fireEvent.click(corner);

        await fireEvent.keyDown(corner, { key: "Delete" });

        expect(handles.data.size).toBe(3);
        for (const recordId of ["a", "b", "c"]) {
            expect(handles.data.get(recordId)?.get("name")).toBe(null);
        }
    });
});

describe("Grid row removal confirmation (FTR-5191, keyboard-triggered)", () => {
    beforeEach(() => {
        HTMLDialogElement.prototype.showModal = vi.fn();
        HTMLDialogElement.prototype.close = vi.fn();
    });

    it("asks for confirmation before removing rows, and cancelling leaves the rows in place", async () => {
        const { handles, view } = setup({ confirmRowDelete: true });
        const rowA = view.getByRole("rowheader", { name: "Select row 1" });
        const rowB = view.getByRole("rowheader", { name: "Select row 2" });
        await fireEvent.click(rowA);
        await fireEvent.click(rowB, { ctrlKey: true });

        await fireEvent.keyDown(rowB, { key: "Delete" });

        const dialog = view.container.querySelector("dialog")!;
        expect(dialog.textContent).toContain("2 selected rows");

        await fireEvent.click(view.getByText("Cancel", { selector: "button" }));
        expect(handles.data.has("a")).toBe(true);
        expect(handles.data.has("b")).toBe(true);
    });

    it("removes every selected row once the deletion is confirmed", async () => {
        const { handles, view } = setup({ confirmRowDelete: true });
        const rowA = view.getByRole("rowheader", { name: "Select row 1" });
        const rowB = view.getByRole("rowheader", { name: "Select row 2" });
        await fireEvent.click(rowA);
        await fireEvent.click(rowB, { ctrlKey: true });

        await fireEvent.keyDown(rowB, { key: "Delete" });
        await fireEvent.click(view.getByText("Delete", { selector: "button" }));

        expect(handles.data.has("a")).toBe(false);
        expect(handles.data.has("b")).toBe(false);
        expect(handles.data.has("c")).toBe(true);
    });
});

describe("Grid bulk checkbox/select commits (FTR-5191)", () => {
    it("applies a checkbox commit to every selected writable cell", async () => {
        const { handles, view } = setup();
        await fireEvent.click(cellTd(view.container, "a", "done"));
        await fireEvent.click(cellTd(view.container, "b", "done"), { shiftKey: true });

        // A real click on the checkbox would also reselect down to that one
        // cell (the shared td capture-phase click handler), so this fires
        // only the value-changed event, as a spacebar toggle on the already
        // focused, still multi-selected checkbox would.
        const checkbox = cellTd(view.container, "b", "done").querySelector<HTMLInputElement>("input[type=checkbox]")!;
        checkbox.checked = true;
        await fireEvent.change(checkbox);

        expect(handles.data.get("a")?.get("done")).toBe(true);
        expect(handles.data.get("b")?.get("done")).toBe(true);
        expect(handles.data.get("c")?.get("done")).toBe(false); // outside the selection
    });

    it("applies a select commit to every selected writable cell", async () => {
        const { handles, view } = setup();
        await fireEvent.click(cellTd(view.container, "a", "status"));
        await fireEvent.click(cellTd(view.container, "b", "status"), { shiftKey: true });

        const select = cellTd(view.container, "b", "status").querySelector("select")!;
        await fireEvent.change(select, { target: { value: "Done" } });

        expect(handles.data.get("a")?.get("status")).toBe("Done");
        expect(handles.data.get("b")?.get("status")).toBe("Done");
        expect(handles.data.get("c")?.get("status")).toBe("Open"); // outside the selection
    });

    it("does not bulk-apply a single-cell commit (unchanged behavior)", async () => {
        const { handles, view } = setup();
        await fireEvent.click(cellTd(view.container, "a", "done"));

        const checkbox = cellTd(view.container, "a", "done").querySelector<HTMLInputElement>("input[type=checkbox]")!;
        await fireEvent.click(checkbox);

        expect(handles.data.get("a")?.get("done")).toBe(true);
        expect(handles.data.get("b")?.get("done")).toBe(false);
        expect(handles.data.get("c")?.get("done")).toBe(false);
    });
});

describe("Grid mixed selection status (FTR-5191)", () => {
    it('shows "N cells selected · M editable" when a computed/read-only column is part of the selection', async () => {
        const { view } = setup({ extraColumn: true });
        await fireEvent.click(cellTd(view.container, "a", "name"));
        await fireEvent.click(cellTd(view.container, "a", "total"), { shiftKey: true });

        const status = view.getByTestId("grid-selection-status");
        expect(status.textContent).toContain("4 cells selected");
        expect(status.textContent).toContain("3 editable");
    });
});
