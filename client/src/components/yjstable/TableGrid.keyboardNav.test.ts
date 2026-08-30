import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord, createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: "CREATE TABLE tasks (id uuid, name text, score integer, status text);",
    columns: [
        { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "name", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
        {
            name: "score",
            dataType: "integer",
            isNullable: true,
            isPrimaryKey: false,
            kind: "integer",
            checkOptions: [],
        },
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

function setup() {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    addRecord(handles, { name: "Alpha", score: 1, status: "Open" }, "a");
    addRecord(handles, { name: "Beta", score: 2, status: "Done" }, "b");
    addRecord(handles, { name: "Gamma", score: 3, status: "Open" }, "c");
    const result: TableQueryResult = {
        columns: ["id", "name", "score", "status"],
        rows: [
            { id: "a", name: "Alpha", score: 1, status: "Open" },
            { id: "b", name: "Beta", score: 2, status: "Done" },
            { id: "c", name: "Gamma", score: 3, status: "Open" },
        ],
    };
    const props = {
        handles,
        schema,
        query: "SELECT id, name, score, status FROM tasks",
        result,
        componentTypes: { status: "select" },
        columnLabels: {},
        hiddenColumns: { id: true },
        columnOrder: ["name", "score", "status"],
        session,
    };
    return { doc, handles, view: render(TableGrid, { props }) };
}

/** The cell's `<td>`: clicking it selects the cell without touching the editor toggle. */
function cellTd(container: HTMLElement, rowId: string, column: string): HTMLElement {
    return container.querySelector<HTMLElement>(`td[data-row-id="${rowId}"][data-col="${column}"]`)!;
}

/** The cell's display button (text/number cells only), used both to click-start editing and as a keydown target. */
function cellButton(container: HTMLElement, rowId: string, column: string): HTMLButtonElement {
    return cellTd(container, rowId, column).querySelector<HTMLButtonElement>("button")!;
}

function isActive(container: HTMLElement, rowId: string, column: string): boolean {
    return cellTd(container, rowId, column).classList.contains("grid-active");
}

/** Select a cell the way a mouse click does, without opening its editor. */
async function selectCell(container: HTMLElement, rowId: string, column: string) {
    await fireEvent.click(cellTd(container, rowId, column));
}

describe("TableGrid keyboard navigation (#5188)", () => {
    it("moves the active cell in all four directions with arrow keys", async () => {
        const { view } = setup();
        await selectCell(view.container, "b", "score");
        expect(isActive(view.container, "b", "score")).toBe(true);

        await fireEvent.keyDown(cellButton(view.container, "b", "score"), { key: "ArrowUp" });
        expect(isActive(view.container, "a", "score")).toBe(true);

        await fireEvent.keyDown(cellButton(view.container, "a", "score"), { key: "ArrowDown" });
        await fireEvent.keyDown(cellButton(view.container, "b", "score"), { key: "ArrowDown" });
        expect(isActive(view.container, "c", "score")).toBe(true);

        await fireEvent.keyDown(cellButton(view.container, "c", "score"), { key: "ArrowLeft" });
        expect(isActive(view.container, "c", "name")).toBe(true);

        await fireEvent.keyDown(cellButton(view.container, "c", "name"), { key: "ArrowRight" });
        expect(isActive(view.container, "c", "score")).toBe(true);
    });

    it("clamps arrow movement at the grid edge instead of leaving the grid", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "ArrowUp" });
        expect(isActive(view.container, "a", "name")).toBe(true);
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "ArrowLeft" });
        expect(isActive(view.container, "a", "name")).toBe(true);
    });

    it("extends a rectangular selection from the anchor with Shift+Arrow", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "ArrowDown", shiftKey: true });
        await fireEvent.keyDown(cellButton(view.container, "b", "name"), { key: "ArrowRight", shiftKey: true });

        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(4);
        expect(isActive(view.container, "b", "score")).toBe(true);
    });

    it("Escape reduces an extended range to the active cell", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "ArrowDown", shiftKey: true });
        await fireEvent.keyDown(cellButton(view.container, "b", "name"), { key: "ArrowRight", shiftKey: true });

        await fireEvent.keyDown(cellButton(view.container, "b", "score"), { key: "Escape" });

        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(1);
        expect(isActive(view.container, "b", "score")).toBe(true);
    });

    it("Shift+Enter moves the active cell up", async () => {
        const { view } = setup();
        await selectCell(view.container, "b", "name");
        await fireEvent.keyDown(cellButton(view.container, "b", "name"), { key: "Enter", shiftKey: true });
        expect(isActive(view.container, "a", "name")).toBe(true);
    });

    it("Tab moves right across cell types and wraps to the next row at the edge", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "Tab" });
        expect(isActive(view.container, "a", "score")).toBe(true);

        await fireEvent.keyDown(cellButton(view.container, "a", "score"), { key: "Tab" });
        expect(isActive(view.container, "a", "status")).toBe(true);

        // status is a select cell (always native, no view/edit button); Tab from it
        // must still wrap to the first cell of the next row.
        const statusSelect = cellTd(view.container, "a", "status").querySelector<HTMLSelectElement>("select")!;
        await fireEvent.keyDown(statusSelect, { key: "Tab" });
        expect(isActive(view.container, "b", "name")).toBe(true);
    });

    it("Shift+Tab moves left and wraps back to the previous row at the edge", async () => {
        const { view } = setup();
        await selectCell(view.container, "b", "name");
        await fireEvent.keyDown(cellButton(view.container, "b", "name"), { key: "Tab", shiftKey: true });
        expect(isActive(view.container, "a", "status")).toBe(true);
    });

    it("F2 and Enter both start editing the active text cell", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        const td = cellTd(view.container, "a", "name");

        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "F2" });
        expect(td.querySelector("input")).not.toBeNull();
        await fireEvent.keyDown(td.querySelector("input")!, { key: "Escape" });
        expect(td.querySelector("input")).toBeNull();

        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "Enter" });
        expect(td.querySelector("input")).not.toBeNull();
    });

    it("typing a printable character on the active cell replaces its content and starts editing", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "Z" });

        const input = cellTd(view.container, "a", "name").querySelector<HTMLInputElement>("input")!;
        expect(input).not.toBeNull();
        expect(input.value).toBe("Z");
    });

    it("Enter commits an edit, writes the value, and moves the active cell down", async () => {
        const { handles, view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "F2" });

        const td = cellTd(view.container, "a", "name");
        const input = td.querySelector<HTMLInputElement>("input")!;
        await fireEvent.input(input, { target: { value: "Alpha Prime" } });
        await fireEvent.keyDown(input, { key: "Enter" });

        expect(td.querySelector("input")).toBeNull();
        expect(handles.data.get("a")?.get("name")).toBe("Alpha Prime");
        expect(isActive(view.container, "b", "name")).toBe(true);
    });

    it("Tab commits an edit and moves the active cell right", async () => {
        const { handles, view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "F2" });

        const input = cellTd(view.container, "a", "name").querySelector<HTMLInputElement>("input")!;
        await fireEvent.input(input, { target: { value: "Alpha 2" } });
        await fireEvent.keyDown(input, { key: "Tab" });

        expect(cellTd(view.container, "a", "name").querySelector("input")).toBeNull();
        expect(handles.data.get("a")?.get("name")).toBe("Alpha 2");
        expect(isActive(view.container, "a", "score")).toBe(true);
    });

    it("Escape leaves edit mode without committing the in-progress edit", async () => {
        const { handles, view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "F2" });

        const td = cellTd(view.container, "a", "name");
        const input = td.querySelector<HTMLInputElement>("input")!;
        await fireEvent.input(input, { target: { value: "Discarded" } });
        await fireEvent.keyDown(input, { key: "Escape" });

        expect(td.querySelector("input")).toBeNull();
        expect(handles.data.get("a")?.get("name")).toBe("Alpha");
        expect(td.querySelector("button")?.textContent).toBe("Alpha");
    });

    it("IME composition keydowns are not treated as Grid navigation shortcuts", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        // Simulate an IME composing Enter keystroke: Grid must not start editing from it.
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "Enter", isComposing: true });

        const td = cellTd(view.container, "a", "name");
        expect(td.querySelector("input")).toBeNull();
        expect(isActive(view.container, "a", "name")).toBe(true);
    });

    it("arrow keys inside a focused select cell keep native option-cycling behavior instead of navigating", async () => {
        const { view } = setup();
        const select = cellTd(view.container, "a", "status").querySelector<HTMLSelectElement>("select")!;
        select.focus();
        await fireEvent.keyDown(select, { key: "ArrowDown" });
        // Grid must not move the active cell while a native select owns arrow keys.
        expect(isActive(view.container, "a", "status")).toBe(false);
        expect(document.activeElement).toBe(select);
    });

    it("leaves Escape native in select controls without reducing a stale Grid range", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "ArrowDown", shiftKey: true });
        await fireEvent.keyDown(cellButton(view.container, "b", "name"), { key: "ArrowRight", shiftKey: true });
        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(4);

        const select = cellTd(view.container, "a", "status").querySelector<HTMLSelectElement>("select")!;
        select.focus();
        const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
        await fireEvent(select, escape);

        expect(escape.defaultPrevented).toBe(false);
        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(4);
        expect(document.activeElement).toBe(select);
    });

    it("reduces a keyboard range whose active cell is a native select", async () => {
        const { view } = setup();
        await selectCell(view.container, "a", "score");
        await fireEvent.keyDown(cellButton(view.container, "a", "score"), { key: "ArrowDown", shiftKey: true });
        await fireEvent.keyDown(cellButton(view.container, "b", "score"), { key: "ArrowRight", shiftKey: true });
        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(4);

        const select = cellTd(view.container, "b", "status").querySelector<HTMLSelectElement>("select")!;
        expect(document.activeElement).toBe(select);
        const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
        await fireEvent(select, escape);

        expect(escape.defaultPrevented).toBe(true);
        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(1);
        expect(isActive(view.container, "b", "status")).toBe(true);
    });

    it("survives keyed row re-render by restoring DOM focus to the same logical cell", async () => {
        const { view } = setup();
        await selectCell(view.container, "b", "name");
        await fireEvent.keyDown(cellButton(view.container, "b", "name"), { key: "ArrowDown" });
        expect(isActive(view.container, "c", "name")).toBe(true);

        await waitFor(() => {
            expect(document.activeElement).toBe(cellButton(view.container, "c", "name"));
        });
    });

    it("keeps the newly active cell scrolled into view", async () => {
        const scrollIntoView = vi.fn();
        HTMLElement.prototype.scrollIntoView = scrollIntoView;
        const { view } = setup();
        await selectCell(view.container, "a", "name");
        await fireEvent.keyDown(cellButton(view.container, "a", "name"), { key: "ArrowDown" });
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    });
});
