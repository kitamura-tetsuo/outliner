import { describe, expect, it } from "vitest";
import { Item, Project } from "./app-schema";

describe("Items.iterateUnordered", () => {
    it("yields all items without guaranteeing order", () => {
        const project = Project.createInstance("unordered-test");
        const rootItems: any = (project as any).items;

        const a = rootItems.addNode("user");
        a.updateText("A");
        const b = rootItems.addNode("user");
        b.updateText("B");
        const c = rootItems.addNode("user");
        c.updateText("C");

        // Use iterateUnordered
        const ids = new Set<string>();
        let count = 0;

        // iterateUnordered returns an IterableIterator, so we can use for...of directly
        for (const item of rootItems.iterateUnordered()) {
            expect(item).toBeInstanceOf(Item);
            ids.add(item.id);
            count++;
        }

        expect(count).toBe(3);
        expect(ids.has(a.id)).toBe(true);
        expect(ids.has(b.id)).toBe(true);
        expect(ids.has(c.id)).toBe(true);
    });
});
