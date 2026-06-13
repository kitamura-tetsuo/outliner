import { describe, expect, it } from "vitest";
import { Cursor } from "../lib/Cursor";
import { store } from "../stores/store.svelte";
import { Item, Project } from "./yjs-schema";

describe("Cursor.searchItem recursion over Large Trees", () => {
    it("should find the target item in a tree using findTarget", () => {
        const project = Project.createInstance("test-project");
        store.project = project;
        const rootItems = project.items;

        // Build a tree
        let last = rootItems.addNode("user");
        last.updateText("Root");

        for (let i = 0; i < 10; i++) {
            const next = last.items.addNode("user");
            next.updateText(`Item ${i}`);
            last = next;
        }

        // Add some siblings to test non-linear paths
        const c1 = last.items.addNode("user");
        c1.updateText("Child 1");
        const c2 = last.items.addNode("user");
        c2.updateText("Child 2");

        // Initialize Cursor at the bottom
        const cursor = new Cursor(
            "cur-1",
            {
                itemId: c2.id,
                offset: 0,
                isActive: true,
                userId: "u1",
            } as unknown as { itemId: string; offset: number; isActive: boolean; userId: string; },
        );

        // Ensure no exception is thrown and the target is found
        let found: Item | null | undefined;
        expect(() => {
            found = cursor.findTarget();
        }).not.toThrow();
        expect(found?.id).toBe(c2.id);
    });
});
