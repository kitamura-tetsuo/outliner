import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Item } from "../schema/yjs-schema";
import { Cursor } from "./Cursor";

// Store module mock setup - prefer local type from PR branch to avoid .svelte imports

const { mockSelections, mockSetSelection } = vi.hoisted(() => ({
    mockSelections: {} as Record<string, unknown>,
    mockSetSelection: vi.fn(),
}));

vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        setSelection: (sel: unknown) => {
            mockSetSelection(sel);
            const s = sel as { userId?: string; };
            if (s && s.userId) {
                mockSelections[s.userId] = s;
            } else {
                mockSelections["test-user"] = s;
            }
        },
        clearSelectionForUser: (userId: string) => {
            delete mockSelections[userId];
        },
        get selections() {
            return mockSelections;
        },
        startCursorBlink: vi.fn(),
        updateCursor: vi.fn(),
        setCursor: vi.fn(() => "new-cursor-id"),
        setActiveItem: vi.fn(),
        getTextareaRef: vi.fn(() => document.createElement("textarea")),
        clearCursorForItem: vi.fn(),
        cursorInstances: {
            get: vi.fn(),
        },
    },
}));

describe("Cursor Selection Navigation", () => {
    let cursor: Cursor;
    let mockItems: Item[];

    beforeEach(async () => {
        vi.clearAllMocks();
        for (const key in mockSelections) delete mockSelections[key];

        // Setup mock items
        mockItems = [
            { id: "item1", text: "Hello" } as Item,
            { id: "item2", text: "World" } as Item,
            { id: "item3", text: "Test" } as Item,
        ];

        // Setup store
        const { store: generalStore } = await import("../stores/store.svelte");
        (generalStore as unknown as { currentPage: unknown; }).currentPage = {
            id: "page1",
            items: mockItems,
        } as unknown as Item;

        // Mock document structure for isReversed calculation
        document.body.innerHTML = `
            <div data-item-id="item1" class="outliner-item"><span class="item-text">Hello</span></div>
            <div data-item-id="item2" class="outliner-item"><span class="item-text">World</span></div>
            <div data-item-id="item3" class="outliner-item"><span class="item-text">Test</span></div>
            <textarea class="global-textarea"></textarea>
            <div class="editor-overlay"></div>
        `;

        // Initialize Cursor
        cursor = new Cursor("test-cursor", {
            itemId: "item1",
            offset: 0,
            isActive: true,
            userId: "test-user",
        });

        // Spy on findTarget to return mock items
        vi.spyOn(cursor as unknown as { findTarget: () => unknown; }, "findTarget").mockImplementation(() => {
            return mockItems.find(i => i.id === cursor.itemId);
        });

        // Ensure getTargetText works
        vi.spyOn(cursor as unknown as { getTargetText: (target: { text?: string; }) => string; }, "getTargetText")
            .mockImplementation((target: { text?: string; }) => target?.text || "");
    });

    afterEach(() => {
        for (const key in mockSelections) delete mockSelections[key];
    });

    describe("Shift+Right Selection", () => {
        it("should create new selection to the right within same item", async () => {
            await import("../stores/EditorOverlayStore.svelte");

            cursor.offset = 0;
            cursor.extendSelectionRight();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 1,
                isReversed: false,
            }));
            expect(cursor.offset).toBe(1);
        });

        it("should extend existing selection to the right within same item", async () => {
            // Initial selection: 0->1
            mockSelections["test-user"] = {
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 1,
                isReversed: false,
                userId: "test-user",
            };
            cursor.offset = 1;

            cursor.extendSelectionRight();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 2,
                isReversed: false,
            }));
            expect(cursor.offset).toBe(2);
        });

        it("should shrink reversed selection when moving right", async () => {
            // Initial selection: 2->1 (reversed)
            mockSelections["test-user"] = {
                startItemId: "item1",
                startOffset: 2,
                endItemId: "item1",
                endOffset: 1,
                isReversed: true,
                userId: "test-user",
            };
            cursor.offset = 1;

            cursor.extendSelectionRight();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 2, // Anchor stays
                endItemId: "item1",
                endOffset: 2, // Cursor moves right
                isReversed: false, // Collapsed selection is not reversed
            }));
            expect(cursor.offset).toBe(2);
        });

        it("should extend selection to next item", async () => {
            cursor.offset = 5; // End of "Hello"
            cursor.extendSelectionRight();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 5,
                endItemId: "item2",
                endOffset: 0,
                isReversed: false,
            }));
            expect(cursor.itemId).toBe("item2");
            expect(cursor.offset).toBe(0);
        });
    });

    describe("Shift+Left Selection", () => {
        it("should create new selection to the left within same item", async () => {
            cursor.offset = 5; // End of "Hello"
            cursor.extendSelectionLeft();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 5,
                endItemId: "item1",
                endOffset: 4,
                isReversed: true,
            }));
            expect(cursor.offset).toBe(4);
        });

        it("should extend existing reversed selection to the left", async () => {
            // Initial selection: 5->4 (reversed)
            mockSelections["test-user"] = {
                startItemId: "item1",
                startOffset: 5,
                endItemId: "item1",
                endOffset: 4,
                isReversed: true,
                userId: "test-user",
            };
            cursor.offset = 4;

            cursor.extendSelectionLeft();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 5, // Anchor
                endItemId: "item1",
                endOffset: 3, // Focus moves left
                isReversed: true,
            }));
            expect(cursor.offset).toBe(3);
        });

        it("should shrink normal selection when moving left", async () => {
            // Initial selection: 0->1 (normal)
            mockSelections["test-user"] = {
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 1,
                isReversed: false,
                userId: "test-user",
            };
            cursor.offset = 1;

            cursor.extendSelectionLeft();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 0,
                isReversed: false,
            }));
            expect(cursor.offset).toBe(0);
        });

        it("should extend selection to previous item", async () => {
            cursor.itemId = "item2";
            cursor.offset = 0; // Start of "World"
            cursor.extendSelectionLeft();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item2",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 5, // End of "Hello"
                isReversed: true,
            }));
            expect(cursor.itemId).toBe("item1");
            expect(cursor.offset).toBe(5);
        });
    });

    describe("Direction Reversal", () => {
        it("should flip from normal to reversed when moving left past anchor", async () => {
            // Initial selection: 1->1
            mockSelections["test-user"] = {
                startItemId: "item1",
                startOffset: 1, // Anchor at 1
                endItemId: "item1",
                endOffset: 1, // Focus at 1
                isReversed: false,
                userId: "test-user",
            };
            cursor.offset = 1;

            // Move left past anchor (1)
            cursor.extendSelectionLeft();

            // Should become 1->0, reversed
            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 1, // Anchor stays at 1
                endItemId: "item1",
                endOffset: 0, // Focus moves to 0
                isReversed: true,
            }));
        });

        it("should flip from reversed to normal when moving right past anchor", async () => {
            // Initial selection: 1->1 (was reversed)
            mockSelections["test-user"] = {
                startItemId: "item1",
                startOffset: 1,
                endItemId: "item1",
                endOffset: 1,
                isReversed: true,
                userId: "test-user",
            };
            cursor.offset = 1;

            // Move right past anchor
            cursor.extendSelectionRight();

            // Should become 1->2, normal
            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 1,
                endItemId: "item1",
                endOffset: 2,
                isReversed: false,
            }));
        });
    });

    describe("Cross-Item Reversal with DOM fallback failure", () => {
        it("should calculate isReversed correctly using tree fallback when DOM is missing", async () => {
            // Clear DOM to force fallback
            document.body.innerHTML = "";

            cursor.itemId = "item2";
            cursor.offset = 0;

            // Move Left to Item 1 (End).
            cursor.extendSelectionLeft();

            expect(mockSetSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item2",
                endItemId: "item1",
                isReversed: true,
            }));
        });
    });
});
