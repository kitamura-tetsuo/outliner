import { describe, expect, it } from "vitest";
import { iterateItems } from "../../../utils/itemTraversal";

describe("itemTraversal - iterateItems", () => {
    it("should return an empty iterable for null or undefined", () => {
        expect(Array.from(iterateItems(null))).toEqual([]);
        expect(Array.from(iterateItems(undefined))).toEqual([]);
    });

    it("should use iterateUnordered if it is a function", () => {
        const items = {
            iterateUnordered: () => [1, 2, 3][Symbol.iterator](),
        };
        expect(Array.from(iterateItems(items))).toEqual([1, 2, 3]);
    });

    it("should support standard Iterables", () => {
        const items = [4, 5, 6];
        expect(Array.from(iterateItems(items))).toEqual([4, 5, 6]);
    });

    it("should support array-like objects with length and at", () => {
        const items = {
            length: 2,
            at: (i: number) => ["a", "b"][i],
        };
        expect(Array.from(iterateItems(items))).toEqual(["a", "b"]);
    });

    it("should support array-like objects with length and index access", () => {
        const items = {
            length: 2,
            0: "c",
            1: "d",
        };
        expect(Array.from(iterateItems(items))).toEqual(["c", "d"]);
    });

    it("should skip undefined values in array-like objects", () => {
        const items = {
            length: 3,
            0: "e",
            2: "f",
        };
        expect(Array.from(iterateItems(items))).toEqual(["e", "f"]);
    });

    it("should return empty array for unknown object types", () => {
        expect(Array.from(iterateItems({}))).toEqual([]);
        expect(Array.from(iterateItems(123))).toEqual([]);
    });
});
