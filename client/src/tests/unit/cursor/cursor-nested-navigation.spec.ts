import { beforeEach, describe, expect, test, vi } from "vitest";
import { Cursor } from "../../../lib/Cursor";
import { Item as Page, Project } from "../../../schema/app-schema";

vi.mock("../../../stores/store.svelte", () => ({
    store: {
        get currentPage() {
            return mockCurrentPage;
        },
        set currentPage(page) {
            mockCurrentPage = page;
        },
        startCursorBlink: vi.fn(),
        project: {
            sendCursor: vi.fn(),
            awareness: {
                setLocalStateField: vi.fn(),
            },
        },
    },
}));

let mockCurrentPage: Page | null = null;

describe("Cursor moveUp and moveDown on nested items", () => {
    let project: Project;
    let cursor: Cursor;
    let page: Page;

    // We will build a tree:
    // root1 (level 1)
    //   child1 (level 2)
    //     grandchild1 (level 3)
    //   child2 (level 2)
    // root2 (level 1)

    beforeEach(() => {
        project = Project.createInstance("Test Project");
        page = project.addPage("Page 1", "test-user");
        mockCurrentPage = page;

        const root1 = page.items.addNode("test-user");
        root1.text = "root1"; // index 0

        const child1 = root1.items.addNode("test-user");
        child1.text = "child1"; // index 0 in root1

        const grandchild1 = child1.items.addNode("test-user");
        grandchild1.text = "grandchild1"; // index 0 in child1

        const child2 = root1.items.addNode("test-user");
        child2.text = "child2"; // index 1 in root1

        const root2 = page.items.addNode("test-user");
        root2.text = "root2"; // index 1 in page

        cursor = new Cursor("test-client", {
            itemId: grandchild1.id,
            offset: 0,
            isActive: true,
            userId: "test-user",
        });

        cursor.applyToStore = vi.fn();
    });

    test("moveUp from grandchild1 goes to child1", () => {
        const root1 = page.items.at(0)!;
        const child1 = root1.items.at(0)!;
        const grandchild1 = child1.items.at(0)!;

        cursor.itemId = grandchild1.id;
        cursor.offset = 0;
        cursor.moveUp();

        expect(cursor.itemId).toBe(child1.id);
    });

    test("moveDown from child1 goes to grandchild1", () => {
        const root1 = page.items.at(0)!;
        const child1 = root1.items.at(0)!;
        const grandchild1 = child1.items.at(0)!;

        cursor.itemId = child1.id;
        cursor.offset = 0;
        cursor.moveDown();

        expect(cursor.itemId).toBe(grandchild1.id);
    });

    test("moveUp from child2 goes to grandchild1", () => {
        const root1 = page.items.at(0)!;
        const child1 = root1.items.at(0)!;
        const grandchild1 = child1.items.at(0)!;
        const child2 = root1.items.at(1)!;

        cursor.itemId = child2.id;
        cursor.offset = 0;
        cursor.moveUp();

        expect(cursor.itemId).toBe(grandchild1.id);
    });

    test("moveDown from grandchild1 goes to child2", () => {
        const root1 = page.items.at(0)!;
        const child1 = root1.items.at(0)!;
        const grandchild1 = child1.items.at(0)!;
        const child2 = root1.items.at(1)!;

        cursor.itemId = grandchild1.id;
        cursor.offset = 0;
        cursor.moveDown();

        expect(cursor.itemId).toBe(child2.id);
    });

    test("moveDown from child2 goes to root2", () => {
        const root1 = page.items.at(0)!;
        const child2 = root1.items.at(1)!;
        const root2 = page.items.at(1)!;

        cursor.itemId = child2.id;
        cursor.offset = 0;
        cursor.moveDown();

        expect(cursor.itemId).toBe(root2.id);
    });

    test("moveUp from root2 goes to child2", () => {
        const root1 = page.items.at(0)!;
        const child2 = root1.items.at(1)!;
        const root2 = page.items.at(1)!;

        cursor.itemId = root2.id;
        cursor.offset = 0;
        cursor.moveUp();

        expect(cursor.itemId).toBe(child2.id);
    });

    test("moveUp from root1 goes to the page (its parent title item)", () => {
        // root1 is the first child of the page. Moving up from the first
        // top-level item navigates to the page title item itself, which is a
        // navigable/editable item in the outliner (see the CLM-6f0bdbc3 E2E test).
        const root1 = page.items.at(0)!;

        cursor.itemId = root1.id;
        cursor.offset = 0;
        cursor.moveUp();

        expect(cursor.itemId).toBe(page.id);
    });

    test("moveDown from root2 stays at root2 (last item)", () => {
        const root2 = page.items.at(1)!;

        cursor.itemId = root2.id;
        cursor.offset = 0;
        cursor.moveDown();

        expect(cursor.itemId).toBe(root2.id);
    });
});
