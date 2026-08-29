import { describe, expect, it } from "vitest";
import { isPrintableKey, moveActiveCell } from "./gridKeyboardNav";

const rows = ["row-a", "row-b", "row-c"];
const columns = ["name", "status", "owner"];

describe("moveActiveCell", () => {
    it("moves in all four directions", () => {
        const center = { rowId: "row-b", columnId: "status" };
        expect(moveActiveCell(center, "up", rows, columns)).toEqual({ rowId: "row-a", columnId: "status" });
        expect(moveActiveCell(center, "down", rows, columns)).toEqual({ rowId: "row-c", columnId: "status" });
        expect(moveActiveCell(center, "left", rows, columns)).toEqual({ rowId: "row-b", columnId: "name" });
        expect(moveActiveCell(center, "right", rows, columns)).toEqual({ rowId: "row-b", columnId: "owner" });
    });

    it("clamps arrow-style movement at the grid edge instead of wrapping", () => {
        const topLeft = { rowId: "row-a", columnId: "name" };
        expect(moveActiveCell(topLeft, "up", rows, columns)).toBeUndefined();
        expect(moveActiveCell(topLeft, "left", rows, columns)).toBeUndefined();

        const bottomRight = { rowId: "row-c", columnId: "owner" };
        expect(moveActiveCell(bottomRight, "down", rows, columns)).toBeUndefined();
        expect(moveActiveCell(bottomRight, "right", rows, columns)).toBeUndefined();
    });

    it("wraps horizontal movement to the next/previous row when requested (Tab behavior)", () => {
        const lastColumn = { rowId: "row-a", columnId: "owner" };
        expect(moveActiveCell(lastColumn, "right", rows, columns, { wrap: true })).toEqual({
            rowId: "row-b",
            columnId: "name",
        });

        const firstColumn = { rowId: "row-b", columnId: "name" };
        expect(moveActiveCell(firstColumn, "left", rows, columns, { wrap: true })).toEqual({
            rowId: "row-a",
            columnId: "owner",
        });
    });

    it("clamps a wrap at the first/last row rather than leaving the grid", () => {
        const veryLast = { rowId: "row-c", columnId: "owner" };
        expect(moveActiveCell(veryLast, "right", rows, columns, { wrap: true })).toBeUndefined();

        const veryFirst = { rowId: "row-a", columnId: "name" };
        expect(moveActiveCell(veryFirst, "left", rows, columns, { wrap: true })).toBeUndefined();
    });

    it("returns undefined when the current cell is not present (skips stale/removed rows or columns)", () => {
        expect(moveActiveCell({ rowId: "missing", columnId: "name" }, "down", rows, columns)).toBeUndefined();
        expect(moveActiveCell({ rowId: "row-a", columnId: "missing" }, "down", rows, columns)).toBeUndefined();
    });
});

describe("isPrintableKey", () => {
    it("accepts a single visible character, with or without Shift", () => {
        expect(isPrintableKey({ key: "a", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
        expect(isPrintableKey({ key: "A", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
        expect(isPrintableKey({ key: "5", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    });

    it("rejects multi-character key names", () => {
        expect(isPrintableKey({ key: "Enter", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
        expect(isPrintableKey({ key: "ArrowLeft", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
        expect(isPrintableKey({ key: "F2", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
    });

    it("rejects Ctrl/Meta/Alt combos even for single-character keys", () => {
        expect(isPrintableKey({ key: "a", ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
        expect(isPrintableKey({ key: "a", ctrlKey: false, metaKey: true, altKey: false })).toBe(false);
        expect(isPrintableKey({ key: "a", ctrlKey: false, metaKey: false, altKey: true })).toBe(false);
    });
});
