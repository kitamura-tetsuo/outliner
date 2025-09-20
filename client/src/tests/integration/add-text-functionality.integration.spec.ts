import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import OutlinerTree from "../../components/OutlinerTree.svelte";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";

// jsdom doesn't implement ResizeObserver; provide a minimal stub for component logic
class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserver;

/**
 * Integration test mirroring e2e/basic/add-text-functionality.spec.ts
 * Verifies that adding an item and updating its text changes the underlying data structure via a Svelte 5 component.
 */

describe("add-text-functionality", () => {
    it("adds a new item and persists text", async () => {
        const user = userEvent.setup();
        const project = Project.createInstance("test");
        const page = project.addPage("page", "me");
        // Provide global store references expected by components
        generalStore.project = project;
        generalStore.currentPage = page;
        render(OutlinerTree, { pageItem: page, projectName: "test", pageName: "page" });

        await user.click(screen.getByText("アイテム追加"));
        const newItem = page.items.at(0);
        expect(newItem).toBeTruthy();

        newItem!.updateText("hello world");
        expect(await screen.findByText("hello world")).toBeTruthy();
        expect(page.items.length).toBe(1);
        expect(newItem!.text.toString()).toBe("hello world");
    });
});
