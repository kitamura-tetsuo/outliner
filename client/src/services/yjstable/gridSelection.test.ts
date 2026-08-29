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
        expect(selection.regions[0].rowIds).toEqual(["row-a", "row-b"]);
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
        expect(selection.regions[0].rowIds).toHaveLength(10_000);
        expect(selection.regions[0].columnIds).toHaveLength(100);
        expect(Object.keys(selection.regions[0])).toEqual(["kind", "rowIds", "columnIds"]);
    });
});
