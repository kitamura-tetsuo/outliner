// Regression coverage for the table Grid UI losing every column-reorder drop.
//
// A table block is rendered inside an OutlinerItem, and OutlinerItem installs
// capture-phase `drop`/`dragover` listeners on the item root that call
// preventDefault + stopImmediatePropagation. Those fire before the `th`'s own
// bubble-phase `ondrop`, so unless the table marks itself with
// `data-block-dnd-owner` the reorder handler never runs.
//
// These tests mount the real table components inside a host that installs the
// same guard OutlinerItem uses (`isBlockOwnedDragEvent`), so the marker and the
// guard are verified together rather than in isolation.

import { render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { isBlockOwnedDragEvent } from "../../services/dnd/blockDndOwnership";
import { COLUMN_DRAG_TYPE } from "../../services/yjstable/columnOrder";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

const COLUMNS = ["id", "col_a", "col_b", "col_c"];
const QUERY = "SELECT id, col_a, col_b, col_c FROM test_table";

const schema: ParsedTableSchema = {
    tableName: "test_table",
    createSql: "CREATE TABLE test_table (id uuid, col_a text, col_b text, col_c text);",
    columns: COLUMNS.map((name) => ({
        name,
        dataType: name === "id" ? "uuid" : "text",
        isNullable: name !== "id",
        isPrimaryKey: name === "id",
        kind: "text" as const,
        checkOptions: [],
    })),
};

const result: TableQueryResult = {
    columns: COLUMNS,
    rows: [{ id: "1", col_a: "A1", col_b: "B1", col_c: "C1" }],
};

const session: RelationResolver = { resolveRelation: vi.fn() };

let doc: Y.Doc;
let handles: TableHandles;

function storedColumnOrder(): string[] {
    const order = handles.uiDef.get("columnOrder");
    return order instanceof Y.Array ? (order as Y.Array<string>).toArray() : [];
}

/**
 * Minimal stand-in for `DataTransfer`, which jsdom does not implement. `types`
 * tracks `setData` the way the real one does, since the ownership guard reads it.
 */
function fakeDataTransfer(initial: Record<string, string> = {}) {
    const values = new Map<string, string>(Object.entries(initial));
    return {
        effectAllowed: "",
        dropEffect: "",
        get types(): string[] {
            return Array.from(values.keys());
        },
        setData: (format: string, value: string) => void values.set(format, value),
        getData: (format: string) => values.get(format) ?? "",
    };
}

/**
 * jsdom always reports a zero-sized rect, which would make every drop land on
 * the same side of the target. Give the element a real box so the component's
 * left/right (or above/below) split is exercised.
 */
function stubRect(element: Element, rect: { left: number; top: number; width: number; height: number; }) {
    element.getBoundingClientRect = () =>
        ({
            x: rect.left,
            y: rect.top,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            right: rect.left + rect.width,
            bottom: rect.top + rect.height,
            toJSON: () => ({}),
        }) as DOMRect;
}

function dispatchDragEvent(
    element: Element,
    type: string,
    dataTransfer: ReturnType<typeof fakeDataTransfer>,
    point: { clientX?: number; clientY?: number; } = {},
): Event {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: point.clientX ?? 0,
        clientY: point.clientY ?? 0,
    });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    element.dispatchEvent(event);
    return event;
}

/**
 * Mounts `component` inside a host that reproduces OutlinerItem's capture-phase
 * dragenter/dragover/drop listeners. Each counter records the events the item
 * would have consumed for itself.
 */
function renderInsideOutlinerItem(component: unknown, props: Record<string, unknown>) {
    const host = document.createElement("div");
    host.className = "outliner-item";
    host.setAttribute("data-item-id", "item-1");
    document.body.appendChild(host);

    const itemDropHandled = vi.fn();
    const itemDragOverHandled = vi.fn();
    const itemDragEnterHandled = vi.fn();

    const listeners = [
        ["drop", itemDropHandled],
        ["dragover", itemDragOverHandled],
        ["dragenter", itemDragEnterHandled],
    ] as const;
    for (const [type, handled] of listeners) {
        host.addEventListener(type, (event: Event) => {
            if (isBlockOwnedDragEvent(event)) return; // block owns this drag
            handled();
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }, { capture: true });
    }

    const { container } = render(component as unknown as Parameters<typeof render>[0], { props });
    host.appendChild(container);

    return { host, container, itemDropHandled, itemDragOverHandled, itemDragEnterHandled };
}

beforeEach(() => {
    document.body.innerHTML = "";
    doc = new Y.Doc();
    handles = {
        doc,
        tableId: "test-table",
        schemaText: doc.getText("schemaText"),
        uiDef: doc.getMap("uiDef"),
        data: doc.getMap("data"),
        undo: { undo: vi.fn(), redo: vi.fn() } as unknown as Y.UndoManager,
    };
});

describe("TableGrid drag & drop ownership inside an OutlinerItem", () => {
    function renderGrid() {
        return renderInsideOutlinerItem(TableGrid, {
            handles,
            schema,
            query: QUERY,
            result,
            componentTypes: {},
            columnLabels: {},
            hiddenColumns: {},
            columnOrder: [],
            session,
        });
    }

    it("marks the grid root as owning only its own column drags", () => {
        const { container } = renderGrid();
        const grid = container.querySelector(".yjs-table-grid");
        expect(grid?.getAttribute("data-block-dnd-owner")).toBe("yjstable");
        expect(grid?.getAttribute("data-block-dnd-type")).toBe(COLUMN_DRAG_TYPE);
    });

    it("lets a header drop reach the grid handler and write the new column order", () => {
        const { container, itemDropHandled, itemDragOverHandled, itemDragEnterHandled } = renderGrid();

        const source = container.querySelector("th[data-col='col_b'] .column-drag-handle")!;
        const target = container.querySelector("th[data-col='col_a']")!;
        stubRect(target, { left: 100, top: 0, width: 100, height: 20 });

        const dataTransfer = fakeDataTransfer();
        dispatchDragEvent(source, "dragstart", dataTransfer);
        expect(dataTransfer.getData(COLUMN_DRAG_TYPE)).toBe("col_b");

        // Native order: dragenter fires before dragover, and both must be guarded.
        // clientX in the left half of col_a → insert before it.
        dispatchDragEvent(target, "dragenter", dataTransfer, { clientX: 110, clientY: 10 });
        dispatchDragEvent(target, "dragover", dataTransfer, { clientX: 110, clientY: 10 });
        dispatchDragEvent(target, "drop", dataTransfer, { clientX: 110, clientY: 10 });

        expect(storedColumnOrder()).toEqual(["id", "col_b", "col_a", "col_c"]);
        expect(itemDropHandled).not.toHaveBeenCalled();
        expect(itemDragOverHandled).not.toHaveBeenCalled();
        expect(itemDragEnterHandled).not.toHaveBeenCalled();
    });

    it("still lets the item consume drops that land outside the table block", () => {
        const { host, itemDropHandled } = renderGrid();

        const plainTarget = document.createElement("span");
        host.appendChild(plainTarget);

        dispatchDragEvent(plainTarget, "drop", fakeDataTransfer());

        expect(itemDropHandled).toHaveBeenCalledTimes(1);
        expect(storedColumnOrder()).toEqual([]);
    });

    it("still lets the item consume an unrelated drop landing on a body cell", () => {
        const { container, itemDropHandled, itemDragEnterHandled } = renderGrid();

        // A file or outliner-item drag carries no column payload, so the grid does
        // not claim it and the host item handles it exactly as it did before.
        const cell = container.querySelector("td[data-col='col_a']")!;
        const dataTransfer = fakeDataTransfer({ "text/plain": "some dragged text" });

        dispatchDragEvent(cell, "dragenter", dataTransfer);
        dispatchDragEvent(cell, "drop", dataTransfer);

        expect(itemDropHandled).toHaveBeenCalledTimes(1);
        expect(itemDragEnterHandled).toHaveBeenCalledTimes(1);
        expect(storedColumnOrder()).toEqual([]);
    });
});

describe("TableUiDefEditor drag & drop ownership inside an OutlinerItem", () => {
    function renderEditor() {
        return renderInsideOutlinerItem(TableUiDefEditor, {
            handles,
            schema,
            query: QUERY,
            componentTypes: {},
            columnLabels: {},
            hiddenColumns: {},
            resultColumns: COLUMNS,
            columnOrder: [],
        });
    }

    it("marks the editor root as owning only its own column drags", () => {
        const { container } = renderEditor();
        const editor = container.querySelector(".ui-def-editor");
        expect(editor?.getAttribute("data-block-dnd-owner")).toBe("yjstable");
        expect(editor?.getAttribute("data-block-dnd-type")).toBe(COLUMN_DRAG_TYPE);
    });

    it("still lets the item consume an unrelated drop landing on the query input", () => {
        const { container, itemDropHandled } = renderEditor();

        const queryInput = container.querySelector("#yjs-table-query-input")!;
        dispatchDragEvent(queryInput, "drop", fakeDataTransfer({ "text/plain": "pasted text" }));

        expect(itemDropHandled).toHaveBeenCalledTimes(1);
        expect(storedColumnOrder()).toEqual([]);
    });

    it("lets a column-row drop reach the editor handler and write the new column order", () => {
        const { container, itemDropHandled } = renderEditor();

        const rows = container.querySelectorAll(".component-row");
        expect(Array.from(rows).map((row) => row.querySelector(".column-name")?.textContent)).toEqual(COLUMNS);

        const source = rows[2]; // col_b
        const target = rows[1]; // col_a
        stubRect(target, { left: 0, top: 100, width: 200, height: 20 });

        const dataTransfer = fakeDataTransfer();
        dispatchDragEvent(source, "dragstart", dataTransfer);

        // clientY in the top half of the col_a row → insert above it.
        dispatchDragEvent(target, "dragover", dataTransfer, { clientX: 10, clientY: 105 });
        dispatchDragEvent(target, "drop", dataTransfer, { clientX: 10, clientY: 105 });

        expect(storedColumnOrder()).toEqual(["id", "col_b", "col_a", "col_c"]);
        expect(itemDropHandled).not.toHaveBeenCalled();
    });
});
