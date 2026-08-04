import { describe, expect, it } from "vitest";
import type { Item } from "../../src/app-schema.js";
import { iterateItems, iterateItemsDeep, iterateItemsOrdered } from "../../src/utils/itemTraversal.js";

describe("iterateItems", () => {
    it("returns empty array for falsy input", () => {
        expect(Array.from(iterateItems(null))).toEqual([]);
        expect(Array.from(iterateItems(undefined))).toEqual([]);
    });

    it("uses iterateUnordered if available", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = {
            iterateUnordered: function*() {
                yield item1;
            },
        };
        const result = Array.from(iterateItems(items));
        expect(result).toEqual([item1]);
    });

    it("supports standard iterables", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = [item1];
        const result = Array.from(iterateItems(items));
        expect(result).toEqual([item1]);
    });

    it("supports array-like objects with length and at()", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = {
            length: 1,
            at: (i: number) => i === 0 ? item1 : undefined,
        };
        const result = Array.from(iterateItems(items));
        expect(result).toEqual([item1]);
    });

    it("supports array-like objects with length and index access", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = {
            length: 1,
            0: item1,
        };
        const result = Array.from(iterateItems(items));
        expect(result).toEqual([item1]);
    });

    it("skips undefined values in array-like objects", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = {
            length: 2,
            0: undefined,
            1: item1,
        };
        const result = Array.from(iterateItems(items));
        expect(result).toEqual([item1]);
    });

    it("returns empty array for object without expected methods", () => {
        const result = Array.from(iterateItems({ foo: "bar" }));
        expect(result).toEqual([]);
    });
});

describe("iterateItemsOrdered", () => {
    it("returns empty array for falsy input", () => {
        expect(Array.from(iterateItemsOrdered(null))).toEqual([]);
        expect(Array.from(iterateItemsOrdered(undefined))).toEqual([]);
    });

    it("supports standard iterables", () => {
        const item1 = { id: "1" } as unknown as Item;
        const item2 = { id: "2" } as unknown as Item;
        const items = [item1, item2];
        const result = Array.from(iterateItemsOrdered(items));
        expect(result).toEqual([item1, item2]);
    });

    it("supports array-like objects with length and at()", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = {
            length: 1,
            at: (i: number) => i === 0 ? item1 : undefined,
        };
        const result = Array.from(iterateItemsOrdered(items));
        expect(result).toEqual([item1]);
    });

    it("supports array-like objects with length and index access", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = {
            length: 1,
            0: item1,
        };
        const result = Array.from(iterateItemsOrdered(items));
        expect(result).toEqual([item1]);
    });

    it("skips undefined values in array-like objects", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = {
            length: 2,
            at: (i: number) => i === 1 ? item1 : undefined,
        };
        const result = Array.from(iterateItemsOrdered(items));
        expect(result).toEqual([item1]);
    });

    it("returns empty array for object without expected methods", () => {
        const result = Array.from(iterateItemsOrdered({ foo: "bar" }));
        expect(result).toEqual([]);
    });
});

describe("iterateItemsDeep", () => {
    it("returns empty iterable for falsy input", () => {
        expect(Array.from(iterateItemsDeep(null))).toEqual([]);
        expect(Array.from(iterateItemsDeep(undefined))).toEqual([]);
    });

    it("returns empty iterable when root iterator is empty", () => {
        const items = { length: 0 };
        const result = Array.from(iterateItemsDeep(items));
        expect(result).toEqual([]);
    });

    it("should iterate deeply using direct items property", () => {
        const item4 = { id: "4", items: [] } as unknown as Item;
        const item3 = { id: "3", items: [item4] } as unknown as Item;
        const item2 = { id: "2", items: [] } as unknown as Item;
        const item1 = { id: "1", items: [item2, item3] } as unknown as Item;
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items));
        expect(result.map(i => i.id)).toEqual(["1", "2", "3", "4"]);
    });

    it("should iterate deeply using get('items')", () => {
        const item3 = { id: "3", get: (k: string) => k === "items" ? [] : undefined };
        const item2 = { id: "2", get: (k: string) => k === "items" ? [] : undefined };
        const item1 = { id: "1", get: (k: string) => k === "items" ? [item2, item3] : undefined };
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map(i => i.id)).toEqual(["1", "2", "3"]);
    });

    it("handles deeply nested structures that return empty iterators", () => {
        const item1 = { id: "1", items: { length: 0 } };
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map(i => i.id)).toEqual(["1"]);
    });

    it("skips non-object items and continues", () => {
        const item2 = { id: "2" } as unknown as Item;
        const items = [null, undefined, "not object", item2];
        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result).toContain(item2);
    });
});
