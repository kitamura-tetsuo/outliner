import { describe, expect, it } from "vitest";
// import * as Y from "yjs"; // Removed unused import
import { Item, Project } from "./app-schema";

describe("Item Iterable", () => {
    it("should iterate over children using for...of", () => {
        const project = Project.createInstance("Page 1");
        const page = project.addPage("Page 1");
        const items = page.items;

        items.addNode("user1");
        items.addNode("user1");
        items.addNode("user1");

        let count = 0;
        for (const item of items) {
            expect(item).toBeInstanceOf(Item);
            count++;
        }
        expect(count).toBe(3);
    });

    it("should work with Array.from", () => {
        const project = Project.createInstance("Page 1");
        const page = project.addPage("Page 1");
        const items = page.items;

        items.addNode("user1");
        items.addNode("user1");

        const itemArray = Array.from(items);
        expect(itemArray.length).toBe(2);
        expect(itemArray[0]).toBeInstanceOf(Item);
        expect(itemArray[1]).toBeInstanceOf(Item);
    });

    it("should iterate over nested children", () => {
        const project = Project.createInstance("Page 1");
        const page = project.addPage("Page 1");
        const rootItems = page.items;

        // Add root items
        const item1 = rootItems.addNode("user1");
        // const item2 = rootItems.addNode("user1"); // Not used

        // Add nested items
        const child1 = item1.items.addNode("user1");
        child1.items.addNode("user1");

        // Check root level iteration
        expect(Array.from(rootItems).length).toBe(1);

        // Check nested level iteration
        expect(Array.from(item1.items).length).toBe(1);
        expect(Array.from(child1.items).length).toBe(1);
    });
});
