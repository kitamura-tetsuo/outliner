import { describe, expect, it, vi } from "vitest";
import type { Item } from "../schema/app-schema";
import { iterateItems } from "./itemTraversal";

describe("iterateItems", () => {
    it("returns empty array for null/undefined", () => {
        expect(Array.from(iterateItems(null))).toEqual([]);
        expect(Array.from(iterateItems(undefined))).toEqual([]);
    });

    it("uses iterateUnordered if available", () => {
        const mockItem = { id: "1" } as Item;
        const mockIterator = function*() {
            yield mockItem;
        };
        const mockIterateUnordered = vi.fn().mockImplementation(mockIterator);

        const items = {
            iterateUnordered: mockIterateUnordered,
        };

        const result = Array.from(iterateItems(items));

        expect(mockIterateUnordered).toHaveBeenCalled();
        expect(result).toEqual([mockItem]);
    });

    it("falls back to default iterator", () => {
        const mockItem = { id: "1" } as Item;
        const items = [mockItem]; // Native array has [Symbol.iterator]

        const result = Array.from(iterateItems(items));
        expect(result).toEqual([mockItem]);
    });

    it("falls back to array-like access with at()", () => {
        const mockItem1 = { id: "1" } as Item;
        const mockItem2 = { id: "2" } as Item;
        const items = {
            length: 2,
            at: (i: number) => i === 0 ? mockItem1 : mockItem2,
        };

        const result = Array.from(iterateItems(items));
        expect(result).toEqual([mockItem1, mockItem2]);
    });

    it("falls back to array-like access with index", () => {
        const mockItem = { id: "1" } as Item;
        const items = {
            length: 1,
            0: mockItem,
        };

        const result = Array.from(iterateItems(items));
        expect(result).toEqual([mockItem]);
    });
});
