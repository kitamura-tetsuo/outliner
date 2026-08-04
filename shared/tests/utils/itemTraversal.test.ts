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

    it("skips undefined iterateUnordered", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = {
            iterateUnordered: "not a function",
            [Symbol.iterator]: function*() {
                yield item1;
            },
        };
        const result = Array.from(iterateItems(items));
        expect(result).toEqual([item1]);
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

    it("handles when get returns something other than an iterable", () => {
        const item1 = { id: "1", get: (k: string) => k === "items" ? { foo: "bar" } : undefined };
        const items = [item1];
        const result = Array.from(iterateItemsDeep(items));
        expect(result).toContain(item1);
    });


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
        expect(result.map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
    });

    it("should iterate deeply using get('items')", () => {
        const item3 = { id: "3", get: (k: string) => k === "items" ? [] : undefined };
        const item2 = { id: "2", get: (k: string) => k === "items" ? [] : undefined };
        const item1 = { id: "1", get: (k: string) => k === "items" ? [item2, item3] : undefined };
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1", "2", "3"]);
    });

    it("handles deeply nested structures that return empty iterators", () => {
        const item1 = { id: "1", items: { length: 0 } };
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("skips non-object items and continues", () => {
        const item2 = { id: "2" } as unknown as Item;
        const items = [null, undefined, "not object", item2];
        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result).toContain(item2);
    });

    it("should handle get('items') returning non-iterable", () => {
        const item1 = { id: "1", get: (k: string) => k === "items" ? { foo: "bar" } : undefined };
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("returns empty iterable when root iterator yields nothing", () => {
        const items = {
            [Symbol.iterator]: function*() {},
        };
        const result = Array.from(iterateItemsDeep(items));
        expect(result).toEqual([]);
    });

    it("handles deeply nested structures that yield items which return empty array", () => {
        const item1 = { id: "1", items: { [Symbol.iterator]: function*() {} } };
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("handles deeply nested structures with no items", () => {
        const item1 = { id: "1" } as unknown as Item;
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("skips undefined child items", () => {
        const item1 = { id: "1", items: undefined } as unknown as Item;
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("skips non-object items and continues when they have no properties", () => {
        const item2 = { id: "2" } as unknown as Item;
        const items = [123, "not object", true, item2];
        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result).toContain(item2);
    });

    it("returns correctly for item with get method that returns undefined", () => {
        const item1 = { id: "1", get: (k: string) => k === "items" ? undefined : null } as unknown as Item;
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("handles deeply nested structures that yield items which return null child iterator", () => {
        const item1 = { id: "1", items: { foo: "bar" } };
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("skips non-object item when item is null but truthy somehow", () => {
        const items = [null] as unknown as any[];
        const result = Array.from(iterateItemsDeep(items));
        expect(result).toContain(null);
    });

    it("returns correctly for item with items property that resolves to undefined", () => {
        const item1 = { id: "1", items: undefined } as unknown as Item;
        const items = [item1];
        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("returns correctly for get items that returns falsy", () => {
        const item1 = { id: "1", get: () => undefined } as unknown as Item;
        const items = [item1];
        const result = Array.from(iterateItemsDeep(items)) as any[];
        expect(result.map((i) => i.id)).toEqual(["1"]);
    });

    it("skips non-object item when item is truthy but not object", () => {
        const items = ["string"] as unknown as any[];
        const result = Array.from(iterateItemsDeep(items));
        expect(result).toContain("string");
    });
});

it("covers the done but truthy result in iterator.next", () => {
    // iterator.next() returning { done: true } with stack elements remaining
    const item1 = {
        id: "1",
        items: {
            [Symbol.iterator]: function*() {
                yield null;
                return;
            },
        },
    };
    const items = [item1];
    const result = Array.from(iterateItemsDeep(items)) as any[];
    expect(result.map((i) => i?.id)).toEqual(["1", undefined]);
});
