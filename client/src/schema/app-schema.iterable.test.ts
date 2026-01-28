import { describe, expect, it, vi } from "vitest";
import { Item, Project } from "./app-schema";

// Mock: Among the stores Cursor depends on, only currentPage is used in this test
vi.mock("../stores/store.svelte", () => ({
    store: {
        currentPage: undefined as any,
        subscribe: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
    },
}));

// Lazy import (after vi.mock)
import { Cursor } from "../lib/Cursor";
import { store as generalStore } from "../stores/store.svelte";

describe("Items.asArrayLike iterable characteristics", () => {
    it("supports for..of iteration over Project.items and Item.items", () => {
        const project = Project.createInstance("iterable-test");

        // Create items equivalent to 2 pages directly under the root
        const rootItems: any = (project as any).items;
        const a = rootItems.addNode("user");
        a.updateText("A");
        const b = rootItems.addNode("user");
        b.updateText("B");

        // Ensure for..of works and Item instances are enumerated
        const ids: string[] = [];
        for (const it of rootItems as Iterable<Item>) {
            expect(it).toBeInstanceOf(Item);
            ids.push(it.id);
        }
        expect(ids.length).toBe(rootItems.length);
        expect(new Set(ids).size).toBe(ids.length);

        // Ensure for..of works for children as well
        const child1 = a.items.addNode("user");
        child1.updateText("A-1");
        const child2 = a.items.addNode("user");
        child2.updateText("A-2");

        const childIds: string[] = [];
        for (const ch of a.items as Iterable<Item>) {
            childIds.push(ch.id);
        }
        expect(childIds.length).toBe(2);
    });
});

describe("Cursor.searchItem recursion over children (no exceptions)", () => {
    it("findTarget() locates deep child without throwing", () => {
        const project = Project.createInstance("cursor-search");
        const rootItems: any = (project as any).items;

        const page = rootItems.addNode("user");
        page.updateText("Page");

        const c1 = page.items.addNode("user");
        c1.updateText("child-1");
        const c2 = page.items.addNode("user");
        c2.updateText("child-2");

        // Set the currentPage referenced by Cursor
        (generalStore as any).currentPage = page as Item;

        const cursor = new Cursor("cur-1", {
            itemId: c2.id,
            offset: 0,
            isActive: true,
            userId: "u1",
        } as any);

        // Ensure no exception is thrown and the target is found
        let found: any;
        expect(() => {
            found = cursor.findTarget();
        }).not.toThrow();
        expect(found?.id).toBe(c2.id);
    });
});
