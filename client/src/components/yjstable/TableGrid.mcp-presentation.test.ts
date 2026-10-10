// MCP-saved Grid presentation round trip through the real browser renderer
// (issue #5436, REQ-010): the Yjs snapshot shape `update_grid_presentation`
// persists must drive the normal TableGrid renderer and TableUiDefEditor —
// headers, column identity, order, visibility, cell renderers, add-row and
// delete-confirmation — while record writes stay bound to the unchanged
// result names and stable record IDs.

import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
    createGrid,
    getGridColumnOrder,
    getGridConfirmRowDelete,
    getGridHandles,
    getGridShowAddRowButton,
    readGridComponents,
    setGridColumnOrder,
    setGridComponentField,
    setGridConfirmRowDelete,
    setGridShowAddRowButton,
} from "../../services/yjstable/gridDocs";
import { resolveBareIdMutationAuthority } from "../../services/yjstable/queryAnalysis";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import { cellComponentTypeFor } from "./cellComponents";
import TableGrid from "./TableGrid.svelte";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

const session: RelationResolver = { resolveRelation: vi.fn() };

const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, due_date DATE, done BOOLEAN)",
    columns: [
        { name: "id", dataType: "TEXT", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "title", dataType: "TEXT", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
        {
            name: "due_date",
            dataType: "DATE",
            isNullable: true,
            isPrimaryKey: false,
            kind: "date",
            checkOptions: [],
        },
        {
            name: "done",
            dataType: "BOOLEAN",
            isNullable: true,
            isPrimaryKey: false,
            kind: "boolean",
            checkOptions: [],
        },
    ],
};

const QUERY = "SELECT id, title, due_date, done FROM tasks";
const RESULT_COLUMNS = ["id", "title", "due_date", "done"];

/** Normal browser Table/Grid authoring, then the exact MCP-saved shape. */
function setupSavedPresentation() {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, schema.createSql);
    addRecord(handles, { title: "Write report", due_date: "2026-10-31", done: false }, "r1");
    addRecord(handles, { title: "Pay bills", due_date: "2026-11-30", done: true }, "r2");
    const gridId = createGrid(doc, tableId, { name: "Tasks", query: QUERY });
    const grid = getGridHandles(doc, gridId)!;
    // The `update_grid_presentation` example payload from issue #5436.
    setGridComponentField(grid, "due_date", "label", "期限");
    setGridComponentField(grid, "done", "label", "完了");
    setGridComponentField(grid, "done", "type", "checkbox");
    setGridComponentField(grid, "id", "hidden", true);
    setGridColumnOrder(grid, ["done", "due_date"]);
    setGridShowAddRowButton(grid, false);
    setGridConfirmRowDelete(grid, true);
    const separateId = createGrid(doc, tableId, { name: "Separate", query: QUERY });
    const separateBefore = JSON.stringify(readGridComponents(getGridHandles(doc, separateId)!));

    // Synchronization/reload: fresh documents materialized from the live
    // project and table state, read back through the normal client readers.
    const synced = new Y.Doc();
    Y.applyUpdate(synced, Y.encodeStateAsUpdate(doc));
    const tableSubdoc = (doc.getMap("yjsTables").get(tableId) as Y.Map<unknown>).get("doc") as Y.Doc;
    const syncedSubdoc = (synced.getMap("yjsTables").get(tableId) as Y.Map<unknown>).get("doc") as Y.Doc;
    Y.applyUpdate(syncedSubdoc, Y.encodeStateAsUpdate(tableSubdoc));
    const reloadedGrid = getGridHandles(synced, gridId)!;
    const reloadedHandles = getTableHandles(synced, tableId)!;
    const components = readGridComponents(reloadedGrid);
    const props = {
        grid: reloadedGrid,
        handles: reloadedHandles,
        schema,
        query: QUERY,
        // Displayed row index must not become the write target: r1 renders second.
        result: {
            columns: RESULT_COLUMNS,
            rows: [
                { id: "r2", title: "Pay bills", due_date: "2026-11-30", done: true },
                { id: "r1", title: "Write report", due_date: "2026-10-31", done: false },
            ],
        } satisfies TableQueryResult,
        bareIdAuthority: resolveBareIdMutationAuthority(QUERY, "tasks", schema, RESULT_COLUMNS),
        componentTypes: components.types as Record<string, string | undefined>,
        columnLabels: components.labels as Record<string, string | undefined>,
        hiddenColumns: components.hidden,
        columnOrder: getGridColumnOrder(reloadedGrid),
        showAddRowButton: getGridShowAddRowButton(reloadedGrid),
        confirmRowDelete: getGridConfirmRowDelete(reloadedGrid),
        session,
    };
    return {
        doc,
        synced,
        handles: reloadedHandles,
        grid: reloadedGrid,
        props,
        separateId,
        separateBefore,
        projectDoc: synced,
    };
}

function headerLabels(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("th[data-col] .th-label")).map((th) =>
        th.textContent?.trim().replace(/\s+RO$/, "")
    );
}

describe("MCP-saved Grid presentation in the normal renderer (#5436)", () => {
    beforeEach(() => {
        fakeMonacoRegistry.reset();
        HTMLDialogElement.prototype.showModal = vi.fn();
        HTMLDialogElement.prototype.close = vi.fn();
    });

    it("shows Japanese labels in two placements with DOM identity bound to result names", () => {
        const { props } = setupSavedPresentation();
        const first = render(TableGrid, { props });
        const second = render(TableGrid, { props });

        for (const container of [first.container, second.container]) {
            // Visible order: present saved-order names, then remaining result
            // names in result order, filtered by shown.
            expect(headerLabels(container)).toEqual(["完了", "期限", "title"]);
            expect(container.querySelector("th[data-col='id']")).toBeNull();
            expect(container.querySelector("[data-col='期限']")).toBeNull();
            expect(container.querySelector("th[data-col='done']")).not.toBeNull();
            expect(container.querySelector("th[data-col='done']")?.getAttribute("title")).toBe("done");
            expect(container.querySelector("th[data-col='due_date']")?.getAttribute("title")).toBe("due_date");
            const bodyCols = Array.from(container.querySelectorAll("tbody tr:first-child td[data-col]")).map(
                (td) => td.getAttribute("data-col"),
            );
            expect(bodyCols).toEqual(["done", "due_date", "title"]);
        }
        first.unmount();
        second.unmount();
    });

    it("shows the saved configuration in the definition editor keyed by exact result names", () => {
        const { grid, props } = setupSavedPresentation();
        const view = render(TableUiDefEditor, {
            props: {
                grid,
                schema,
                query: QUERY,
                componentTypes: props.componentTypes,
                columnLabels: props.columnLabels,
                hiddenColumns: props.hiddenColumns,
                resultColumns: RESULT_COLUMNS,
                columnOrder: props.columnOrder,
                showAddRowButton: props.showAddRowButton,
                confirmRowDelete: props.confirmRowDelete,
            },
        });

        expect(view.getByTestId("yjs-table-label-due_date")).toHaveProperty("value", "期限");
        expect(view.getByTestId("yjs-table-label-done")).toHaveProperty("value", "完了");
        expect(view.getByTestId("yjs-table-component-done")).toHaveProperty("value", "checkbox");
        expect(view.getByTestId("yjs-table-component-due_date")).toHaveProperty("value", "auto");
        expect(view.getByTestId("yjs-table-hidden-id")).not.toBeChecked();
        expect(view.getByTestId("yjs-table-hidden-due_date")).toBeChecked();
        const rows = Array.from(view.container.querySelectorAll(".component-row")).map((row) =>
            row.getAttribute("data-col")
        );
        expect(rows).toEqual(["done", "due_date", "id", "title"]);
        view.unmount();
    });

    it("maps explicit types to renderers and null back to schema-driven automatic selection", () => {
        const byName = new Map(schema.columns.map((column) => [column.name, column]));
        // Null (absent override) restores automatic selection: CHECK options
        // first select, otherwise boolean checkbox, integer/number number,
        // date date, and text when no such metadata applies.
        expect(cellComponentTypeFor(undefined, byName.get("done"))).toBe("checkbox");
        expect(cellComponentTypeFor(undefined, byName.get("due_date"))).toBe("date");
        expect(cellComponentTypeFor(undefined, byName.get("title"))).toBe("text");
        expect(cellComponentTypeFor(undefined, undefined)).toBe("text");
        expect(
            cellComponentTypeFor(undefined, {
                name: "n",
                dataType: "INTEGER",
                isNullable: true,
                isPrimaryKey: false,
                kind: "integer",
                checkOptions: [],
            }),
        ).toBe("number");
        expect(
            cellComponentTypeFor(undefined, {
                name: "s",
                dataType: "TEXT",
                isNullable: true,
                isPrimaryKey: false,
                kind: "text",
                checkOptions: ["Open", "Done"],
            }),
        ).toBe("select");
        expect(
            cellComponentTypeFor(undefined, {
                name: "state",
                dataType: "task_state",
                isNullable: true,
                isPrimaryKey: false,
                kind: "enum",
                enumLabels: ["Open", "", "Done"],
            }),
        ).toBe("select");
        // An explicit override wins over the schema kind.
        expect(cellComponentTypeFor("checkbox", byName.get("due_date"))).toBe("checkbox");
        expect(cellComponentTypeFor("date", byName.get("done"))).toBe("date");

        const { props } = setupSavedPresentation();
        const view = render(TableGrid, { props });
        // Explicit checkbox for the boolean column; automatic date for the
        // DATE column with no override — hiding the identity column changes
        // neither renderer.
        expect(
            view.container.querySelector("td[data-row-id='r1'][data-col='done'] input[type='checkbox']"),
        ).not.toBeNull();
        expect(
            view.container.querySelector("td[data-row-id='r1'][data-col='due_date'] input[type='date']"),
        ).not.toBeNull();
        expect(
            view.container.querySelector<HTMLTableCellElement>("td[data-row-id='r1'][data-col='done'] input"),
        ).not.toBeNull();
        view.unmount();
    });

    it("follows the add-row flag and requires delete confirmation without becoming authorization", () => {
        const { handles, props } = setupSavedPresentation();
        const view = render(TableGrid, { props });

        expect(view.queryByTestId("yjs-table-add-row")).toBeNull();

        const deleteButton = view.container.querySelector("button[aria-label='Delete row r1']")!;
        expect(deleteButton).not.toBeNull();
        fireEvent.click(deleteButton);
        expect(view.container.textContent).toContain("Are you sure you want to delete row r1?");
        fireEvent.click(view.getByText("Cancel", { selector: "button" }));
        expect(handles.data.has("r1")).toBe(true);
        expect(handles.data.get("r1")?.get("done")).toBe(false);
        view.unmount();
    });

    it("toggles the relabeled boolean cell by stable record ID, verified by an independent table read", () => {
        const { handles, props, separateId, separateBefore, projectDoc } = setupSavedPresentation();
        const schemaBefore = handles.schemaText.toString();
        const view = render(TableGrid, { props });

        // The 完了 cell of the second displayed row stays editable even with
        // the projected identity column hidden.
        const checkbox = view.container.querySelector<HTMLInputElement>(
            "td[data-row-id='r1'][data-col='done'] input[type='checkbox']",
        )!;
        expect(checkbox).not.toBeNull();
        expect(checkbox.disabled).toBe(false);
        fireEvent.click(checkbox);

        // Independent Table read: only the original record's physical done
        // field changed — not a Japanese-named field, another row, or the
        // schema — and the separate Grid kept its settings.
        expect(handles.data.get("r1")?.get("done")).toBe(true);
        expect(handles.data.get("r1")?.has("完了")).toBe(false);
        expect(handles.data.get("r1")?.get("title")).toBe("Write report");
        expect(handles.data.get("r2")?.get("done")).toBe(true);
        expect(handles.data.get("r2")?.get("title")).toBe("Pay bills");
        expect(handles.data.get("r2")?.get("due_date")).toBe("2026-11-30");
        expect(handles.schemaText.toString()).toBe(schemaBefore);
        expect(JSON.stringify(readGridComponents(getGridHandles(projectDoc, separateId)!))).toBe(separateBefore);
        view.unmount();
    });

    it("keeps a read-only query non-writable under label and type overrides", () => {
        const { props } = setupSavedPresentation();
        const view = render(TableGrid, {
            props: {
                ...props,
                query: "SELECT DISTINCT id, title, due_date, done FROM tasks",
                result: {
                    columns: RESULT_COLUMNS,
                    rows: [{ id: "r1", title: "Write report", due_date: "2026-10-31", done: false }],
                },
            },
        });

        const checkbox = view.container.querySelector<HTMLInputElement>(
            "td[data-col='done'] input[type='checkbox']",
        )!;
        expect(checkbox).not.toBeNull();
        expect(checkbox.disabled).toBe(true);
        expect(view.queryByTestId("grid-readonly-reason")).not.toBeNull();
        view.unmount();
    });
});
