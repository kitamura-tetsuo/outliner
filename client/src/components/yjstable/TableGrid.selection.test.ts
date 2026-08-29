import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: "CREATE TABLE tasks (id uuid, name text, status text);",
    columns: ["id", "name", "status"].map((name, index) => ({
        name,
        dataType: index === 0 ? "uuid" : "text",
        isNullable: index !== 0,
        isPrimaryKey: index === 0,
        kind: "text" as const,
        checkOptions: [],
    })),
};
const session: RelationResolver = { resolveRelation: vi.fn() };

function setup(result: TableQueryResult) {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    const props = {
        handles,
        schema,
        query: "SELECT id, name, status FROM tasks",
        result,
        componentTypes: { status: "select" },
        columnLabels: {},
        hiddenColumns: {},
        columnOrder: [],
        session,
    };
    return { doc, props, view: render(TableGrid, { props }) };
}

const initial: TableQueryResult = {
    columns: ["id", "name", "status"],
    rows: [
        { id: "a", name: "Alpha", status: "Open" },
        { id: "b", name: "Beta", status: "Done" },
        { id: "c", name: "Gamma", status: "Open" },
    ],
};

describe("TableGrid logical selection", () => {
    it("clicks an active cell and Shift-clicks a rectangular range", async () => {
        const { view } = setup(initial);
        const alpha = view.container.querySelector<HTMLElement>('td[data-row-id="a"][data-col="name"]')!;
        const done = view.container.querySelector<HTMLElement>('td[data-row-id="b"][data-col="status"]')!;
        await fireEvent.click(alpha);
        expect(alpha.classList.contains("grid-active")).toBe(true);
        expect(alpha.getAttribute("aria-selected")).toBe("true");

        // SelectCell stops bubbling so the Grid deliberately owns selection
        // in the capture phase, without taking native control focus away.
        await fireEvent.click(done.querySelector("select")!, { shiftKey: true });
        expect(done.classList.contains("grid-active")).toBe(true);
        expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(4);
        expect(alpha.classList.contains("grid-selected")).toBe(true);
    });

    it("selects durable id rows even when query analysis marks the result read-only", async () => {
        const readOnly = setup({ ...initial, columns: ["id", "name"] });
        await readOnly.view.rerender({
            ...readOnly.props,
            query: "SELECT DISTINCT id, name FROM tasks",
            result: { ...initial, columns: ["id", "name"] },
        });
        const cell = readOnly.view.container.querySelector<HTMLElement>('td[data-row-id="a"][data-col="name"]')!;
        await fireEvent.click(cell);
        expect(cell.classList.contains("grid-active")).toBe(true);
    });

    it("survives keyed row re-render and refresh by stable identity without writing Yjs", async () => {
        const { doc, props, view } = setup(initial);
        let updates = 0;
        doc.on("update", () => updates++);
        const selected = view.container.querySelector<HTMLElement>('td[data-row-id="b"][data-col="name"]')!;
        await fireEvent.click(selected);
        expect(updates).toBe(0);

        const sorted = { ...initial, rows: [...initial.rows].reverse() };
        await view.rerender({ ...props, result: sorted });
        await waitFor(() => {
            expect(
                view.container.querySelector('td[data-row-id="b"][data-col="name"]')?.classList.contains("grid-active"),
            )
                .toBe(true);
        });

        const filtered = { ...initial, rows: initial.rows.filter(row => row.id !== "b") };
        await view.rerender({ ...props, result: filtered });
        await waitFor(() => expect(view.container.querySelectorAll("td.grid-selected")).toHaveLength(0));
        expect(updates).toBe(0);
    });
});
