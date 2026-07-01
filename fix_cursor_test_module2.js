import { readFileSync, writeFileSync } from "fs";
const file = "client/src/tests/unit/cursor/cursor-nested-navigation.spec.ts";
let content = readFileSync(file, "utf8");

// I'm changing my mock strategy back to something totally simple.
// I will not mock OutlinerViewModel in vitest because it's too complicated and hoisting keeps failing.
// Instead, I will overwrite outlinerViewModel.isCollapsed globally in beforeEach without vi.mock because outlinerViewModel is a class instance.
// Wait! Is outlinerViewModel a class instance exported from OutlinerViewModel? Yes, it's an instance.
const simpleMock = `import { beforeEach, describe, expect, test, vi } from "vitest";
import { Cursor } from "../../../lib/Cursor";
import { Item as Page, Project } from "../../../schema/app-schema";
import { outlinerViewModel } from "../../../stores/OutlinerViewModel";

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
const mockCollapsedMap = new Map<string, boolean>();

describe("Cursor moveUp and moveDown on nested items", () => {
    let project: Project;
    let cursor: Cursor;
    let page: Page;

    beforeEach(() => {
        mockCollapsedMap.clear();

        // Directly override the method on the imported instance
        outlinerViewModel.isCollapsed = vi.fn().mockImplementation((id: string) => mockCollapsedMap.get(id) || false);

        project = Project.createInstance("Test Project");
        page = project.addPage("Page 1", "test-user");
        mockCurrentPage = page;

        const root1 = page.items.addNode("test-user");
        root1.text = "root1";

        const child1 = root1.items.addNode("test-user");
        child1.text = "child1";

        const grandchild1 = child1.items.addNode("test-user");
        grandchild1.text = "grandchild1";

        const child2 = root1.items.addNode("test-user");
        child2.text = "child2";

        const root2 = page.items.addNode("test-user");
        root2.text = "root2";

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

    test("moveUp from root1 stays at root1 (first item)", () => {
        const root1 = page.items.at(0)!;

        cursor.itemId = root1.id;
        cursor.offset = 0;
        cursor.moveUp();

        expect(cursor.itemId).toBe(root1.id);
    });

    test("moveDown from root2 stays at root2 (last item)", () => {
        const root2 = page.items.at(1)!;

        cursor.itemId = root2.id;
        cursor.offset = 0;
        cursor.moveDown();

        expect(cursor.itemId).toBe(root2.id);
    });

    test("moveDown from root1 skips collapsed children and goes to root2", () => {
        const root1 = page.items.at(0)!;
        const root2 = page.items.at(1)!;

        mockCollapsedMap.set(root1.id, true);

        cursor.itemId = root1.id;
        cursor.offset = 0;
        cursor.moveDown();

        expect(cursor.itemId).toBe(root2.id);
    });

    test("moveUp from root2 goes to root1 if root1 is collapsed", () => {
        const root1 = page.items.at(0)!;
        const root2 = page.items.at(1)!;

        mockCollapsedMap.set(root1.id, true);

        cursor.itemId = root2.id;
        cursor.offset = 0;
        cursor.moveUp();

        expect(cursor.itemId).toBe(root1.id);
    });

    test("moveDown from child1 goes to child2 if child1 is collapsed", () => {
        const child1 = page.items.at(0)!.items.at(0)!;
        const child2 = page.items.at(0)!.items.at(1)!;

        mockCollapsedMap.set(child1.id, true);

        cursor.itemId = child1.id;
        cursor.offset = 0;
        cursor.moveDown();

        expect(cursor.itemId).toBe(child2.id);
    });

    test("moveUp from child2 goes to child1 if child1 is collapsed", () => {
        const child1 = page.items.at(0)!.items.at(0)!;
        const child2 = page.items.at(0)!.items.at(1)!;

        mockCollapsedMap.set(child1.id, true);

        cursor.itemId = child2.id;
        cursor.offset = 0;
        cursor.moveUp();

        expect(cursor.itemId).toBe(child1.id);
    });
});
`;

writeFileSync(file, simpleMock);
