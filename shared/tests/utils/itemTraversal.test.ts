import { describe, expect, it } from "vitest";
import { iterateItemsDeep } from "../../src/utils/itemTraversal.js";
import type { Item } from "../../src/app-schema.js";

describe("iterateItemsDeep", () => {
    it("should iterate deeply", () => {
        const item4 = { id: "4", items: [] } as unknown as Item;
        const item3 = { id: "3", items: [item4] } as unknown as Item;
        const item2 = { id: "2", items: [] } as unknown as Item;
        const item1 = { id: "1", items: [item2, item3] } as unknown as Item;
        const items = [item1];

        const result = Array.from(iterateItemsDeep(items));
        expect(result.map(i => i.id)).toEqual(["1", "2", "3", "4"]);
    });
});
