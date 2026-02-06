import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Project } from "../schema/app-schema";
import { GeneralStore } from "./store.svelte";

describe("GeneralStore Page Existence", () => {
    it("should track page existence correctly", () => {
        const store = new GeneralStore();
        const project = Project.createInstance("Test Project");
        store.project = project;

        // Initially no pages (except maybe root, but iterateUnordered handles it)
        expect(store.pageExists("Page A")).toBe(false);

        // Add a page
        project.addPage("Page A", "user1");

        // Force manual cache rebuild if observers are not firing in test env
        // Accessing private method via any casting for testing
        (store as any)._rebuildPageNamesCache();

        expect(store.pageExists("Page A")).toBe(true);
        expect(store.pageExists("page a")).toBe(true); // Case insensitive
        expect(store.pageExists("Page B")).toBe(false);

        // Add another page
        project.addPage("Page B", "user1");
        (store as any)._rebuildPageNamesCache();
        expect(store.pageExists("Page B")).toBe(true);

        // Rename logic is harder to simulate via Project helper as it doesn't expose renamePage.
        // We can manually update the item text.
        // Find the item
        let itemA;
        for (const item of project.items) {
            if (item.text === "Page A") {
                itemA = item;
                break;
            }
        }

        expect(itemA).toBeDefined();
        if (itemA) {
            itemA.updateText("Page A Renamed");
            (store as any)._rebuildPageNamesCache();
            // Check if cache updates
            expect(store.pageExists("Page A")).toBe(false);
            expect(store.pageExists("Page A Renamed")).toBe(true);
        }

        // Delete page
        if (itemA) {
            itemA.delete();
            (store as any)._rebuildPageNamesCache();
            expect(store.pageExists("Page A Renamed")).toBe(false);
        }
    });
});
