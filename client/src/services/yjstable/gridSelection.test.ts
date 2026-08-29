import { describe, expect, it } from "vitest";
import { GridSelection } from "./gridSelection";

const rows = ["row-a", "row-b", "row-c"];
const columns = ["name", "status", "owner"];

describe("GridSelection", () => {
    it("selects an active and anchor cell", () => {
        const selection = new GridSelection();
        selection.select({ rowId: "row-b", columnId: "status" });
        expect(selection.snapshot()).toEqual({
            activeCell: { rowId: "row-b", columnId: "status" },
            anchorCell: { rowId: "row-b", columnId: "status" },
            regions: [{ kind: "cells", rowIds: ["row-b"], columnIds: ["status"] }],
        });
    });

    it("extends from the anchor to a logical rectangle", () => {
        const selection = new GridSelection();
        selection.select({ rowId: "row-a", columnId: "name" });
        selection.extend({ rowId: "row-c", columnId: "status" }, rows, columns);
        expect(selection.regions[0]).toEqual({
            kind: "cells",
            rowIds: rows,
            columnIds: ["name", "status"],
        });
        expect(selection.contains({ rowId: "row-b", columnId: "status" })).toBe(true);
        expect(selection.isActive({ rowId: "row-c", columnId: "status" })).toBe(true);
    });

    it("preserves selected identities across sorting and query refresh", () => {
        const selection = new GridSelection();
        selection.select({ rowId: "row-a", columnId: "name" });
        selection.extend({ rowId: "row-b", columnId: "status" }, rows, columns);
        selection.reconcile(["row-c", "row-b", "row-a"], ["owner", "status", "name"]);
        expect(selection.contains({ rowId: "row-a", columnId: "name" })).toBe(true);
        expect(selection.contains({ rowId: "row-b", columnId: "status" })).toBe(true);
        expect(selection.activeCell).toEqual({ rowId: "row-b", columnId: "status" });
    });

    it("drops filtered rows and resolves a missing active cell deterministically", () => {
        const selection = new GridSelection();
        selection.select({ rowId: "row-a", columnId: "name" });
        selection.extend({ rowId: "row-c", columnId: "status" }, rows, columns);
        selection.reconcile(["row-a", "row-b"], columns);
        expect(selection.regions[0]).toMatchObject({ rowIds: ["row-a", "row-b"] });
        expect(selection.activeCell).toEqual({ rowId: "row-a", columnId: "name" });
    });

    it("handles disappearing columns and clears when nothing remains", () => {
        const selection = new GridSelection();
        selection.select({ rowId: "row-b", columnId: "status" });
        selection.reconcile(rows, ["name"]);
        expect(selection.snapshot()).toEqual({ activeCell: undefined, anchorCell: undefined, regions: [] });
    });

    it("represents large ranges by axes rather than enumerating cells", () => {
        const manyRows = Array.from({ length: 10_000 }, (_, index) => `row-${index}`);
        const manyColumns = Array.from({ length: 100 }, (_, index) => `column-${index}`);
        const selection = new GridSelection();
        selection.select({ rowId: manyRows[0], columnId: manyColumns[0] });
        selection.extend({ rowId: manyRows.at(-1)!, columnId: manyColumns.at(-1)! }, manyRows, manyColumns);
        expect(selection.regions[0]).toMatchObject({
            rowIds: expect.arrayContaining([manyRows[0], manyRows.at(-1)]),
            columnIds: expect.arrayContaining([manyColumns[0], manyColumns.at(-1)]),
        });
        expect(Object.keys(selection.regions[0])).toEqual(["kind", "rowIds", "columnIds"]);
    });

    it("selects row ranges and toggles multiple stable row identities", () => {
        const selection = new GridSelection();
        selection.selectRow("row-a", rows);
        selection.selectRow("row-c", rows, { extend: true });
        expect(selection.regions).toEqual([{ kind: "rows", rowIds: rows }]);
        expect(selection.activeCell).toBeUndefined();
        expect(selection.containsRow("row-b")).toBe(true);

        selection.selectRow("row-b", rows, { toggle: true });
        expect(selection.regions).toEqual([{ kind: "rows", rowIds: ["row-a", "row-c"] }]);
        selection.reconcile(["row-c", "row-b"], columns);
        expect(selection.regions).toEqual([{ kind: "rows", rowIds: ["row-c"] }]);
    });

    it("selects column ranges and toggles multiple result columns", () => {
        const selection = new GridSelection();
        selection.selectColumn("name", columns);
        selection.selectColumn("owner", columns, { extend: true });
        expect(selection.regions).toEqual([{ kind: "columns", columnIds: columns }]);
        selection.selectColumn("status", columns, { toggle: true });
        expect(selection.regions).toEqual([{ kind: "columns", columnIds: ["name", "owner"] }]);
        expect(selection.containsColumn("owner")).toBe(true);
    });

    it("represents the entire changing query result with one logical region", () => {
        const selection = new GridSelection();
        selection.selectAll();
        expect(selection.regions).toEqual([{ kind: "all" }]);
        expect(selection.contains({ rowId: "unmounted-row", columnId: "name" })).toBe(true);
        selection.reconcile(["another-row"], ["visible-column"]);
        expect(selection.regions).toEqual([{ kind: "all" }]);
        expect(selection.activeCell).toBeUndefined();
    });

    it("composes modifier-selected cells with logical row selections", () => {
        const selection = new GridSelection();
        selection.select({ rowId: "row-a", columnId: "name" });
        selection.selectRow("row-c", rows, { toggle: true });
        expect(selection.regions).toEqual([
            { kind: "cells", rowIds: ["row-a"], columnIds: ["name"] },
            { kind: "rows", rowIds: ["row-c"] },
        ]);
        expect(selection.contains({ rowId: "row-c", columnId: "owner" })).toBe(true);
    });
});
