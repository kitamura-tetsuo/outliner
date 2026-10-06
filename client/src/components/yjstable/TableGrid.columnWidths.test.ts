// Fixed column-width rendering (issue #5457): the Grid's committed width
// overrides from the shared definition render as exact border-box tracks
// while unconfigured columns stay automatic.
//
// The widths under test always originate from the supported production path
// — `createGrid` seeds plus `setGridColumnWidth`, read back through
// `readGridComponents` exactly as `YjsTableView` mirrors them — never from a
// hand-built snapshot. (Writer validation itself lives in
// `gridColumnWidth.test.ts`.) Geometry in real CSS pixels is measured in the
// `grd-grid-fixed-column-widths` E2E spec; jsdom has no layout engine, so here
// the contract is pinned at the render boundary: colgroup tracks, fixed
// marker classes without inline cell styles, table layout mode, and
// selection/edit identity preservation.

import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { createGrid, getGridHandles, readGridComponents, setGridColumnWidth } from "../../services/yjstable/gridDocs";
import type { RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTable, getTableHandles } from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import TableGrid from "./TableGrid.svelte";

const mockSession: RelationResolver = {
    resolveRelation: vi.fn(),
};

const QUERY = "SELECT id, title, done, due_date FROM tasks";

const schema: ParsedTableSchema = {
    tableName: "tasks",
    createSql: "CREATE TABLE tasks (id uuid, title text, done boolean, due_date text);",
    columns: [
        { name: "id", dataType: "uuid", isNullable: false, isPrimaryKey: true, kind: "text", checkOptions: [] },
        { name: "title", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
        { name: "done", dataType: "boolean", isNullable: true, isPrimaryKey: false, kind: "boolean", checkOptions: [] },
        { name: "due_date", dataType: "text", isNullable: true, isPrimaryKey: false, kind: "text", checkOptions: [] },
    ],
};

function twoRowResult(): TableQueryResult {
    return {
        columns: ["id", "title", "done", "due_date"],
        rows: [
            { id: "r1", title: "first", done: true, due_date: "2026-01-01" },
            { id: "r2", title: "second with a much longer value", done: false, due_date: "2026-02-02" },
        ],
    };
}

function baseProps(handles: NonNullable<ReturnType<typeof getTableHandles>>) {
    return {
        handles,
        schema,
        query: QUERY,
        result: twoRowResult(),
        componentTypes: {},
        columnLabels: {},
        hiddenColumns: {},
        columnOrder: [] as string[],
        session: mockSession,
    };
}

describe("TableGrid fixed column widths", () => {
    it("marks fixed headers, body cells and colgroup tracks while auto columns stay unstyled", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: QUERY,
            components: { title: { widthPx: 180 } },
        });
        const grid = getGridHandles(doc, gridId)!;
        // Second width through the production writer, read back through the
        // same mirror `YjsTableView` uses.
        setGridColumnWidth(grid, "done", 48);
        const { widths } = readGridComponents(grid);
        expect(widths).toEqual({ title: 180, done: 48 });

        let updates = 0;
        doc.on("update", () => updates++);

        const { container } = render(TableGrid, {
            props: { ...baseProps(getTableHandles(doc, tableId)!), grid, columnWidths: widths },
        });

        const table = container.querySelector("table")!;
        expect(table.classList.contains("grid-fixed-layout")).toBe(true);
        expect(table.classList.contains("grid-all-fixed")).toBe(false);

        const titleCol = container.querySelector("colgroup col[data-col='title']");
        expect(titleCol?.getAttribute("style")).toContain("width: 180px");
        const doneCol = container.querySelector("colgroup col[data-col='done']");
        expect(doneCol?.getAttribute("style")).toContain("width: 48px");
        const autoCol = container.querySelector("colgroup col[data-col='due_date']");
        expect(autoCol).not.toBeNull();
        expect(autoCol?.getAttribute("style") ?? "").not.toContain("width");

        // Fixed tracks are pinned once on their `<col>` elements; headers
        // and body cells carry the marker class for overflow styling but no
        // inline width of their own.
        const titleHeader = container.querySelector("th[data-col='title']")!;
        expect(titleHeader.classList.contains("col-fixed")).toBe(true);
        expect(titleHeader.getAttribute("style")).toBeNull();

        const titleCells = Array.from(container.querySelectorAll("td[data-col='title']"));
        expect(titleCells).toHaveLength(2);
        for (const cell of titleCells) {
            expect(cell.classList.contains("col-fixed")).toBe(true);
            expect(cell.getAttribute("style")).toBeNull();
        }

        const autoHeader = container.querySelector("th[data-col='due_date']")!;
        expect(autoHeader.classList.contains("col-fixed")).toBe(false);
        expect(autoHeader.getAttribute("style")).toBeNull();
        for (const cell of container.querySelectorAll("td[data-col='due_date']")) {
            expect(cell.classList.contains("col-fixed")).toBe(false);
        }

        // Selection and edit identities are untouched by widths: the same
        // record/cell addresses and the same cell component still render.
        expect(container.querySelector("td[data-row-id][data-col='title']")).not.toBeNull();
        expect(container.querySelector("td[data-col='title'] button.cell-value")).not.toBeNull();

        // Rendering never writes presentation state back.
        expect(updates).toBe(0);
    });

    it("exposes a single selection header for the utility track", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: QUERY,
            components: { title: { widthPx: 180 } },
        });
        const grid = getGridHandles(doc, gridId)!;
        const { widths } = readGridComponents(grid);

        const { container } = render(TableGrid, {
            props: { ...baseProps(getTableHandles(doc, tableId)!), grid, columnWidths: widths },
        });

        // Only the corner header carries the utility-track hook, so a
        // track-width probe never resolves row headers with it.
        expect(container.querySelectorAll("th.selection-header")).toHaveLength(1);
        expect(container.querySelectorAll("th.corner-header")).toHaveLength(1);
        const rowHeaders = container.querySelectorAll("th.row-header");
        expect(rowHeaders).toHaveLength(2);
        for (const header of rowHeaders) {
            expect(header.getAttribute("role")).toBe("rowheader");
        }
    });

    it("collapses to track width when every data column is fixed", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: QUERY,
            components: {
                id: { widthPx: 64 },
                title: { widthPx: 180 },
                done: { widthPx: 48 },
                due_date: { widthPx: 120 },
            },
        });
        const grid = getGridHandles(doc, gridId)!;
        const { widths } = readGridComponents(grid);

        const props = { ...baseProps(getTableHandles(doc, tableId)!), grid, columnWidths: widths };
        const { container, rerender } = render(TableGrid, { props });

        const table = container.querySelector("table")!;
        expect(table.classList.contains("grid-fixed-layout")).toBe(true);
        expect(table.classList.contains("grid-all-fixed")).toBe(true);
        expect(table.style.width).toBe("calc(413px + 4.5rem)");

        await rerender({ ...props, hiddenColumns: { done: true } });
        expect(table.style.width).toBe("calc(365px + 4.5rem)");
        expect(readGridComponents(grid).widths).toEqual(widths);

        await rerender({ ...props, query: "SELECT DISTINCT id, title, done, due_date FROM tasks" });
        expect(container.querySelector("th.actions-col")).toBeNull();
        expect(table.style.width).toBe("calc(413px + 2.5rem)");

        await rerender({ ...props, columnWidths: {} });
        expect(table.classList.contains("grid-all-fixed")).toBe(false);
        expect(table.style.width).toBe("");
    });

    it("stays fully automatic without widths, and treats malformed widths as auto", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, { name: "G", query: QUERY });
        const grid = getGridHandles(doc, gridId)!;
        const handles = getTableHandles(doc, tableId)!;

        const { container, rerender } = render(TableGrid, {
            props: { ...baseProps(handles), grid },
        });
        // No widths: no colgroup, no fixed layout, no pins — content sizing.
        expect(container.querySelector("colgroup")).toBeNull();
        expect(container.querySelector("table")!.classList.contains("grid-fixed-layout")).toBe(false);

        // Out-of-range, fractional and non-numeric values are automatic
        // sizing, never pins and never repairs.
        await rerender({ ...baseProps(handles), grid, columnWidths: { title: 10, done: 1.5 } } as unknown as Record<
            string,
            unknown
        >);
        expect(container.querySelector("colgroup")).toBeNull();
        expect(container.querySelector("th[data-col='title']")!.classList.contains("col-fixed")).toBe(false);
        expect(container.querySelector("th[data-col='title']")!.getAttribute("style")).toBeNull();
    });

    it("returns every track to automatic sizing when all overrides are cleared", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: QUERY,
            components: {
                id: { widthPx: 64 },
                title: { widthPx: 180 },
                done: { widthPx: 48 },
                due_date: { widthPx: 120 },
            },
        });
        const grid = getGridHandles(doc, gridId)!;
        const handles = getTableHandles(doc, tableId)!;
        expect(readGridComponents(grid).widths).toEqual({ id: 64, title: 180, done: 48, due_date: 120 });

        // Clearing goes through the production writer, read back through the
        // same mirror `YjsTableView` uses — the E2E `expectAutoColumn` path.
        for (const column of ["id", "title", "done", "due_date"]) setGridColumnWidth(grid, column, undefined);
        const { widths } = readGridComponents(grid);
        expect(widths).toEqual({});

        const { container, rerender } = render(TableGrid, {
            props: {
                ...baseProps(handles),
                grid,
                columnWidths: { id: 64, title: 180, done: 48, due_date: 120 },
            },
        });
        expect(container.querySelector("colgroup")).not.toBeNull();
        await rerender({ ...baseProps(handles), grid, columnWidths: widths });

        // No colgroup, no fixed layout, and no class or style residue on any
        // header or body cell: the column is fully automatic again.
        expect(container.querySelector("colgroup")).toBeNull();
        expect(container.querySelector("table")!.classList.contains("grid-fixed-layout")).toBe(false);
        for (const column of ["id", "title", "done", "due_date"]) {
            const header = container.querySelector(`th[data-col='${column}']`)!;
            expect(header.classList.contains("col-fixed")).toBe(false);
            expect(header.getAttribute("style")).toBeNull();
            const cells = container.querySelectorAll(`td[data-col='${column}']`);
            expect(cells.length).toBeGreaterThan(0);
            for (const cell of cells) {
                expect(cell.classList.contains("col-fixed")).toBe(false);
                expect(cell.getAttribute("style")).toBeNull();
            }
        }
    });

    it("keeps header pins with zero rows and keeps hidden widths dormant", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: QUERY,
            components: { title: { widthPx: 180 }, done: { widthPx: 48 } },
        });
        const grid = getGridHandles(doc, gridId)!;
        const { widths } = readGridComponents(grid);
        const handles = getTableHandles(doc, tableId)!;

        // A valid result with column metadata but zero rows still pins headers.
        const { container } = render(TableGrid, {
            props: {
                ...baseProps(handles),
                grid,
                result: { columns: ["id", "title", "done", "due_date"], rows: [] },
                hiddenColumns: { title: true },
                columnWidths: widths,
            },
        });

        // The hidden fixed column occupies no rendered track, while its saved
        // width stays intact in the definition for when the name returns.
        expect(container.querySelector("th[data-col='title']")).toBeNull();
        expect(container.querySelector("colgroup col[data-col='title']")).toBeNull();
        expect(readGridComponents(grid).widths).toEqual({ title: 180, done: 48 });

        const doneHeader = container.querySelector("th[data-col='done']")!;
        expect(doneHeader.classList.contains("col-fixed")).toBe(true);
        expect(doneHeader.getAttribute("style")).toBeNull();
        expect(container.querySelector("colgroup col[data-col='done']")?.getAttribute("style"))
            .toContain("width: 48px");
    });

    it("keeps a fixed-width computed result read-only without changing its component", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const computedQuery = "SELECT id, title, UPPER(title) AS shout FROM tasks";
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: computedQuery,
            components: { title: { widthPx: 180 }, shout: { widthPx: 120 } },
        });
        const grid = getGridHandles(doc, gridId)!;
        const { widths } = readGridComponents(grid);
        expect(widths).toEqual({ title: 180, shout: 120 });
        const handles = getTableHandles(doc, tableId)!;

        const { container } = render(TableGrid, {
            props: {
                ...baseProps(handles),
                grid,
                query: computedQuery,
                result: {
                    columns: ["id", "title", "shout"],
                    rows: [{ id: "r1", title: "first", shout: "FIRST" }],
                },
                columnWidths: widths,
            },
        });

        // The computed alias is not a schema column, so it stays outside the
        // SQL-derived editable set even while pinned to its fixed width.
        const shoutHeader = container.querySelector("th[data-col='shout']")!;
        expect(shoutHeader.classList.contains("col-fixed")).toBe(true);
        expect(shoutHeader.getAttribute("style")).toBeNull();
        expect(container.querySelector("colgroup col[data-col='shout']")?.getAttribute("style"))
            .toContain("width: 120px");
        const shoutButton = container.querySelector("td[data-col='shout'] button.cell-value")!;
        expect(shoutButton.getAttribute("aria-disabled")).toBe("true");
        await fireEvent.click(shoutButton);
        expect(container.querySelector("td[data-col='shout'] input.cell-input")).toBeNull();

        // The sibling source column keeps its component and stays writable.
        const titleButton = container.querySelector("td[data-col='title'] button.cell-value")!;
        expect(titleButton.getAttribute("aria-disabled")).toBe("false");
    });

    it("renders the raw grid-less browser fully automatically", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const handles = getTableHandles(doc, tableId)!;

        // The raw Table browser owns no Grid definition and passes no widths:
        // nothing is pinned and no presentation state can be created.
        let updates = 0;
        doc.on("update", () => updates++);
        const { container } = render(TableGrid, { props: { ...baseProps(handles) } });
        expect(container.querySelector("colgroup")).toBeNull();
        expect(container.querySelector("table")!.classList.contains("grid-fixed-layout")).toBe(false);
        expect(container.querySelector("th[data-col='title']")!.getAttribute("style")).toBeNull();
        expect(updates).toBe(0);
    });

    it("returns a cleared column to auto without touching cell identities", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: QUERY,
            components: { title: { widthPx: 180 } },
        });
        const grid = getGridHandles(doc, gridId)!;
        const handles = getTableHandles(doc, tableId)!;

        const first = render(TableGrid, {
            props: {
                ...baseProps(handles),
                grid,
                columnWidths: readGridComponents(grid).widths,
            },
        });
        expect(first.container.querySelector("th[data-col='title']")!.classList.contains("col-fixed")).toBe(true);

        // Clearing the override through the production writer returns the
        // column to auto: no replacement pixel value is stored.
        setGridColumnWidth(grid, "title", undefined);
        expect(readGridComponents(grid).widths).toEqual({});

        const { container } = render(TableGrid, {
            props: { ...baseProps(handles), grid, columnWidths: readGridComponents(grid).widths },
        });
        const header = container.querySelector("th[data-col='title']")!;
        expect(header.classList.contains("col-fixed")).toBe(false);
        expect(header.getAttribute("style")).toBeNull();
        expect(container.querySelector("colgroup")).toBeNull();
        // The same cells still address the same record and source column.
        expect(container.querySelector("td[data-row-id][data-col='title']")).not.toBeNull();
        expect(container.querySelector("td[data-col='title'] button.cell-value")).not.toBeNull();
    });

    it("removes inline pins in place when a fixed width is cleared on a live grid", async () => {
        const { Doc } = await import("yjs");
        const doc = new Doc();
        const tableId = createTable(doc, "Tasks", "tasks");
        const gridId = createGrid(doc, tableId, {
            name: "G",
            query: QUERY,
            components: { title: { widthPx: 180 } },
        });
        const grid = getGridHandles(doc, gridId)!;
        const handles = getTableHandles(doc, tableId)!;

        const { container, rerender } = render(TableGrid, {
            props: {
                ...baseProps(handles),
                grid,
                columnWidths: readGridComponents(grid).widths,
            },
        });
        const pinned = container.querySelector("th[data-col='title']")!;
        expect(pinned.classList.contains("col-fixed")).toBe(true);
        expect(container.querySelector("colgroup col[data-col='title']")?.getAttribute("style"))
            .toContain("width: 180px");

        // Clearing the override updates the same mounted grid: the pin class
        // disappears and headers and cells carry no style residue.
        setGridColumnWidth(grid, "title", undefined);
        await rerender({
            ...baseProps(handles),
            grid,
            columnWidths: readGridComponents(grid).widths,
        });
        const header = container.querySelector("th[data-col='title']")!;
        expect(header.classList.contains("col-fixed")).toBe(false);
        expect(header.getAttribute("style")).toBeNull();
        for (const cell of container.querySelectorAll("td[data-col='title']")) {
            expect(cell.classList.contains("col-fixed")).toBe(false);
            expect(cell.getAttribute("style")).toBeNull();
        }
        expect(container.querySelector("colgroup")).toBeNull();
    });
});
