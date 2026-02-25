import { describe, expect, it, vi } from "vitest";
import { Items } from "../../schema/yjs-schema";

// Mock store modules to avoid Svelte reactivity issues in tests
vi.mock("../../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        setCursor: vi.fn(),
        setSelection: vi.fn(),
        clearCursorAndSelection: vi.fn(),
        clearSelectionForUser: vi.fn(),
    }
}));
vi.mock("../../stores/PresenceStore.svelte", () => ({
    presenceStore: {
        setUser: vi.fn(),
        removeUser: vi.fn(),
    }
}));
vi.mock("../../stores/colorForUser", () => ({
    colorForUser: () => "#000000",
}));

import { yjsService } from "./service";

describe("yjsService move operations", () => {
    it("promoteChildren moves children to parent after item", () => {
        const project = yjsService.createProject("test");
        const parent = yjsService.addItem(project, "root", "u1");
        const item = yjsService.addItem(project, parent.id, "u1"); // item is child of parent
        const child1 = yjsService.addItem(project, item.id, "u1"); // child1 is child of item
        const child2 = yjsService.addItem(project, item.id, "u1"); // child2 is child of item

        // Structure:
        // parent
        //   item
        //     child1
        //     child2

        yjsService.promoteChildren(project, item.id);

        // Expected Structure:
        // parent
        //   item
        //   child1
        //   child2

        const parentItems = new Items(project.ydoc, project.tree, parent.id);
        expect(parentItems.length).toBe(3);
        expect(parentItems.at(0)?.id).toBe(item.id);
        expect(parentItems.at(1)?.id).toBe(child1.id);
        expect(parentItems.at(2)?.id).toBe(child2.id);

        const itemItems = new Items(project.ydoc, project.tree, item.id);
        expect(itemItems.length).toBe(0);
    });

    it("moveItemUp (single item) moves item up and leaves children behind", () => {
        const project = yjsService.createProject("test");
        const parent = yjsService.addItem(project, "root", "u1");
        const sibling1 = yjsService.addItem(project, parent.id, "u1");
        const item = yjsService.addItem(project, parent.id, "u1");
        const child1 = yjsService.addItem(project, item.id, "u1");

        // Structure:
        // parent
        //   sibling1
        //   item
        //     child1

        yjsService.moveItemUp(project, item.id);

        // Expected:
        // parent
        //   item
        //   sibling1
        //   child1

        const parentItems = new Items(project.ydoc, project.tree, parent.id);
        expect(parentItems.length).toBe(3);
        expect(parentItems.at(0)?.id).toBe(item.id);
        expect(parentItems.at(1)?.id).toBe(sibling1.id);
        expect(parentItems.at(2)?.id).toBe(child1.id);
    });

    it("moveItemDown (single item) moves item down and leaves children behind", () => {
        const project = yjsService.createProject("test");
        const parent = yjsService.addItem(project, "root", "u1");
        const item = yjsService.addItem(project, parent.id, "u1");
        const sibling1 = yjsService.addItem(project, parent.id, "u1");
        const child1 = yjsService.addItem(project, item.id, "u1");

        // Structure:
        // parent
        //   item
        //     child1
        //   sibling1

        yjsService.moveItemDown(project, item.id);

        // Expected:
        // parent
        //   child1
        //   item
        //   sibling1

        // Note: moveItemDown promotes children (Child1 becomes sibling after Item),
        // then moves Item down (swaps with next sibling).
        // 1. Promote: Item, Child1, Sibling1
        // 2. Move Down (Item swaps with Child1): Child1, Item, Sibling1

        const parentItems = new Items(project.ydoc, project.tree, parent.id);
        expect(parentItems.length).toBe(3);
        expect(parentItems.at(0)?.id).toBe(child1.id);
        expect(parentItems.at(1)?.id).toBe(item.id);
        expect(parentItems.at(2)?.id).toBe(sibling1.id);
    });

    it("moveSubtreeUp moves item and children", () => {
        const project = yjsService.createProject("test");
        const parent = yjsService.addItem(project, "root", "u1");
        const sibling1 = yjsService.addItem(project, parent.id, "u1");
        const item = yjsService.addItem(project, parent.id, "u1");
        const child1 = yjsService.addItem(project, item.id, "u1");

        // Structure:
        // parent
        //   sibling1
        //   item
        //     child1

        yjsService.moveSubtreeUp(project, item.id);

        // Expected:
        // parent
        //   item
        //     child1
        //   sibling1

        const parentItems = new Items(project.ydoc, project.tree, parent.id);
        expect(parentItems.at(0)?.id).toBe(item.id);
        expect(parentItems.at(1)?.id).toBe(sibling1.id);

        const itemItems = new Items(project.ydoc, project.tree, item.id);
        expect(itemItems.length).toBe(1);
        expect(itemItems.at(0)?.id).toBe(child1.id);
    });

     it("moveSubtreeDown moves item and children", () => {
        const project = yjsService.createProject("test");
        const parent = yjsService.addItem(project, "root", "u1");
        const item = yjsService.addItem(project, parent.id, "u1");
        const sibling1 = yjsService.addItem(project, parent.id, "u1");
        const child1 = yjsService.addItem(project, item.id, "u1");

        // Structure:
        // parent
        //   item
        //     child1
        //   sibling1

        yjsService.moveSubtreeDown(project, item.id);

        // Expected:
        // parent
        //   sibling1
        //   item
        //     child1

        const parentItems = new Items(project.ydoc, project.tree, parent.id);
        expect(parentItems.at(0)?.id).toBe(sibling1.id);
        expect(parentItems.at(1)?.id).toBe(item.id);

        const itemItems = new Items(project.ydoc, project.tree, item.id);
        expect(itemItems.length).toBe(1);
        expect(itemItems.at(0)?.id).toBe(child1.id);
    });
});
