import { describe, expect, it } from "vitest";
import { moveColumn, orderColumns } from "./columnOrder";

describe("columnOrder", () => {
    describe("orderColumns", () => {
        it("retains stored columns that exist in the result in stored order", () => {
            const resultColumns = ["a", "b", "c"];
            const storedOrder = ["c", "a"];
            expect(orderColumns(resultColumns, storedOrder)).toEqual(["c", "a", "b"]);
        });

        it("appends result columns not in stored order", () => {
            const resultColumns = ["a", "b", "c"];
            const storedOrder = ["a"];
            expect(orderColumns(resultColumns, storedOrder)).toEqual(["a", "b", "c"]);
        });

        it("ignores stored columns that no longer exist in the result", () => {
            const resultColumns = ["a", "c"];
            const storedOrder = ["a", "b", "c"];
            expect(orderColumns(resultColumns, storedOrder)).toEqual(["a", "c"]);
        });

        it("handles disjoint sets", () => {
            const resultColumns = ["x", "y"];
            const storedOrder = ["a", "b"];
            expect(orderColumns(resultColumns, storedOrder)).toEqual(["x", "y"]);
        });

        it("handles empty stored order", () => {
            const resultColumns = ["a", "b", "c"];
            const storedOrder: string[] = [];
            expect(orderColumns(resultColumns, storedOrder)).toEqual(["a", "b", "c"]);
        });

        it("defends against duplicates in stored order or result columns", () => {
            const resultColumns = ["a", "a", "b"];
            const storedOrder = ["b", "b", "c"];
            expect(orderColumns(resultColumns, storedOrder)).toEqual(["b", "a"]);
        });
    });

    describe("moveColumn", () => {
        it("moves column to the right", () => {
            const order = ["a", "b", "c", "d"];
            expect(moveColumn(order, "a", 2)).toEqual(["b", "c", "a", "d"]);
        });

        it("moves column to the left", () => {
            const order = ["a", "b", "c", "d"];
            expect(moveColumn(order, "c", 0)).toEqual(["c", "a", "b", "d"]);
        });

        it("handles no-op moves (same index)", () => {
            const order = ["a", "b", "c", "d"];
            expect(moveColumn(order, "b", 1)).toEqual(["a", "b", "c", "d"]);
        });

        it("handles out-of-range negative index by clamping to 0", () => {
            const order = ["a", "b", "c", "d"];
            expect(moveColumn(order, "c", -5)).toEqual(["c", "a", "b", "d"]);
        });

        it("handles out-of-range positive index by clamping to end", () => {
            const order = ["a", "b", "c", "d"];
            expect(moveColumn(order, "b", 10)).toEqual(["a", "c", "d", "b"]);
        });

        it("returns copy if column not found", () => {
            const order = ["a", "b", "c", "d"];
            expect(moveColumn(order, "z", 1)).toEqual(["a", "b", "c", "d"]);
        });
    });
});
