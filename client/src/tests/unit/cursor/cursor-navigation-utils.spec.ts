import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    findNextItem,
    findPreviousItem,
    getDeepestDescendant,
    isPageItem,
    searchItem,
} from "../../../lib/cursor/CursorNavigationUtils";
import { Item as Page, Project } from "../../../schema/app-schema";

const { mockCurrentPage } = vi.hoisted(() => {
    return { mockCurrentPage: { value: null as Page | null } };
});

vi.mock("../../../stores/store.svelte", () => ({
    store: {
        get currentPage() {
            return mockCurrentPage.value;
        },
        set currentPage(page) {
            mockCurrentPage.value = page;
        },
        activeViewModel: {
            isCollapsed: vi.fn().mockReturnValue(false),
        },
    },
}));

describe("CursorNavigationUtils", () => {
    let project: Project;
    let page: Page;

    beforeEach(() => {
        project = Project.createInstance("Test Project");
        page = project.addPage("Page 1", "test-user");
        mockCurrentPage.value = page;
    });

    test("isPageItem correctly identifies a page root node", () => {
        const rootItem1 = page.items.addNode("test-user");
        expect(isPageItem(page)).toBe(true);
        expect(isPageItem(rootItem1)).toBe(false);
    });

    test("searchItem can find items by ID", () => {
        const rootItem1 = page.items.addNode("test-user");
        const child1 = rootItem1.items.addNode("test-user");

        expect(searchItem(page, child1.id)?.id).toBe(child1.id);
        expect(searchItem(page, rootItem1.id)?.id).toBe(rootItem1.id);
        expect(searchItem(page, "invalid-id")).toBeUndefined();
    });

    test("getDeepestDescendant finds the deepest node", () => {
        const rootItem1 = page.items.addNode("test-user");
        const child1 = rootItem1.items.addNode("test-user");
        const grandchild1 = child1.items.addNode("test-user");

        expect(getDeepestDescendant(page).id).toBe(grandchild1.id);
        expect(getDeepestDescendant(rootItem1).id).toBe(grandchild1.id);
        expect(getDeepestDescendant(child1).id).toBe(grandchild1.id);
        expect(getDeepestDescendant(grandchild1).id).toBe(grandchild1.id);
    });

    test("findNextItem navigates to next element correctly", () => {
        const rootItem1 = page.items.addNode("test-user");
        const child1 = rootItem1.items.addNode("test-user");
        const rootItem2 = page.items.addNode("test-user");

        expect(findNextItem(page.id)?.id).toBe(rootItem1.id);
        expect(findNextItem(rootItem1.id)?.id).toBe(child1.id);
        expect(findNextItem(child1.id)?.id).toBe(rootItem2.id);
        expect(findNextItem(rootItem2.id)).toBeUndefined();
    });

    test("findPreviousItem navigates to previous element correctly", () => {
        const rootItem1 = page.items.addNode("test-user");
        const child1 = rootItem1.items.addNode("test-user");
        const rootItem2 = page.items.addNode("test-user");

        expect(findPreviousItem(rootItem2.id)?.id).toBe(child1.id);
        expect(findPreviousItem(child1.id)?.id).toBe(rootItem1.id);

        // This validates that the parent is returned, instead of undefined, for the first child.
        expect(findPreviousItem(rootItem1.id)?.id).toBe(page.id);
        expect(findPreviousItem(page.id)).toBeUndefined();
    });
});
