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

describe("Cursor moveToDocumentStart and End", () => {
    let project: Project;
    let cursor: Cursor;
    let page: Page;

    beforeEach(() => {
        project = Project.createInstance("Test Project");
        page = project.addPage("Page 1", "test-user");
        mockCurrentPage = page;

        const rootItem1 = page.items.addNode("test-user");
        rootItem1.text = "First line";

        const rootItem2 = page.items.addNode("test-user");
        rootItem2.text = "Second line";

        const childItem = rootItem2.items.addNode("test-user");
        childItem.text = "Third line (child)";

        cursor = new Cursor("test-client", {
            itemId: rootItem1.id,
            offset: 0,
            isActive: true,
            userId: "test-user",
        });

        cursor.applyToStore = vi.fn();
    });

    test("moveToDocumentStart moves cursor to the first item (rootItem1)", () => {
        const childItem = page.items.at(1)!.items.at(0)!;
        cursor.itemId = childItem.id;
        cursor.offset = 5;

        cursor.moveToDocumentStart();

        const firstItem = page.items.at(0)!;
        expect(cursor.itemId).toBe(firstItem.id);
        expect(cursor.offset).toBe(0);
    });

    test("moveToDocumentEnd moves cursor to the last item (deepest node)", () => {
        const firstItem = page.items.at(0)!;
        cursor.itemId = firstItem.id;
        cursor.offset = 0;

        cursor.moveToDocumentEnd();

        const lastItem = page.items.at(1)!.items.at(0)!;
        expect(cursor.itemId).toBe(lastItem.id);
        expect(cursor.offset).toBe(lastItem.text?.length);
    });
});
