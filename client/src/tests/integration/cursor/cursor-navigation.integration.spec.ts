import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cursor } from "../../../lib/Cursor";
import type { Item } from "../../../schema/yjs-schema";
import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../../stores/store.svelte";

// Mock the stores
vi.mock("../../../stores/EditorOverlayStore.svelte", () => {
    const mockStore = {
        updateCursor: vi.fn(),
        setCursor: vi.fn(),
        setActiveItem: vi.fn(),
        getTextareaRef: vi.fn(),
        clearCursorForItem: vi.fn(),
        setSelection: vi.fn(),
        clearSelectionForUser: vi.fn(),
        startCursorBlink: vi.fn(),
        triggerOnEdit: vi.fn(),
        cursorInstances: new Map(),
        cursors: {}, // Add cursors object
        clearCursorAndSelection: vi.fn(), // Add clearCursorAndSelection method
    };
    return {
        editorOverlayStore: mockStore,
        store: mockStore,
    };
});

vi.mock("../../../stores/store.svelte", () => {
    return {
        store: {
            currentPage: null,
            project: null,
        },
    };
});

describe("Cursor Integration", () => {
    let mockItem: Item;
    let mockParentItem: Item;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock items with more realistic structure
        mockItem = {
            id: "test-item-1",
            text: "First line\nSecond line\nThird line",
            parent: null,
            items: {
                [Symbol.iterator]: function*() {
                    // Empty iterator
                },
            },
            updateText: vi.fn(),
            delete: vi.fn(),
        } as unknown as Item;

        mockParentItem = {
            id: "parent-item-1",
            text: "Parent item",
            parent: null,
            items: {
                [Symbol.iterator]: function*() {
                    yield mockItem;
                },
                addNode: vi.fn().mockReturnValue(mockItem),
                indexOf: vi.fn().mockReturnValue(0),
            },
            updateText: vi.fn(),
            delete: vi.fn(),
        } as unknown as Item;

        // Set up parent relationship
        mockItem.parent = mockParentItem;

        // Mock the general store
        generalStore.currentPage = mockParentItem;

        // Setup editor overlay store mocks
        editorOverlayStore.setCursor.mockReturnValue("new-cursor-id");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Cursor Navigation", () => {
        it("should navigate between lines correctly", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 15, // Middle of second line
                isActive: true,
                userId: "user-1",
            });

            // Move up to first line
            cursor.moveUp();
            expect(cursor.offset).toBeLessThan(11); // Should be on first line

            // Move down to second line
            cursor.moveDown();
            expect(cursor.offset).toBeGreaterThan(10); // Should be on second line
            expect(cursor.offset).toBeLessThan(22); // But not on third line
        });

        it("should navigate between items when reaching boundaries", () => {
            // Create a second item
            const secondItem = {
                id: "test-item-2",
                text: "Another item",
                parent: mockParentItem,
                items: {
                    [Symbol.iterator]: function*() {
                        // Empty iterator
                    },
                },
                updateText: vi.fn(),
                delete: vi.fn(),
            } as unknown as Item;

            // Update parent to include second item
            mockParentItem.items = {
                [Symbol.iterator]: function*() {
                    yield mockItem;
                    yield secondItem;
                },
                addNode: vi.fn().mockReturnValue(secondItem),
                indexOf: (item: Item) => {
                    if (item === mockItem) return 0;
                    if (item === secondItem) return 1;
                    return -1;
                },
            } as unknown as Item["items"];

            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 0, // Beginning of first item
                isActive: true,
                userId: "user-1",
            });

            // Move left should navigate to previous item (but there isn't one)
            cursor.moveLeft();
            // The cursor should stay on the same item, not move to the parent
            expect(cursor.itemId).toBe("test-item-1"); // Should stay on same item

            // Move to end of first item and then right to next item
            cursor.offset = mockItem.text.length;
            // Note: This would normally trigger navigation, but we're testing the logic here
        });
    });

    describe("Text Operations", () => {
        it("should handle text insertion with selection", () => {
            mockItem.text = "Hello World";
            mockItem.updateText = vi.fn();

            // Mock a selection
            (editorOverlayStore as typeof editorOverlayStore & { selections?: Record<string, unknown>; }).selections = {
                "selection-1": {
                    userId: "user-1",
                    startItemId: "test-item-1",
                    endItemId: "test-item-1",
                    startOffset: 5,
                    endOffset: 11,
                },
            };

            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 8, // Within the selection
                isActive: true,
                userId: "user-1",
            });

            cursor.insertText(" Beautiful");

            // Should replace the selected text
            expect(mockItem.updateText).toHaveBeenCalledWith("Hello Beautiful");
            expect(cursor.offset).toBe(15); // 5 + " Beautiful".length
        });

        it("should handle line breaks correctly", () => {
            mockItem.text = "Hello World";
            mockItem.updateText = vi.fn();

            // Ensure parent has indexOf and addNode methods
            if (mockItem.parent) {
                (mockItem.parent as typeof mockItem.parent & { indexOf?: (item: Item) => number; }).indexOf = (
                    item: Item,
                ) => {
                    if (item === mockItem) return 0;
                    return -1;
                };
                (mockItem.parent as typeof mockItem.parent & { addNode?: (item: string) => Item; }).addNode = vi.fn()
                    .mockReturnValue({
                        id: "new-item-1",
                        text: "World",
                        updateText: vi.fn(),
                        delete: vi.fn(),
                    });
            }

            mockParentItem.items.addNode = vi.fn().mockReturnValue({
                id: "new-item-1",
                text: "World",
                updateText: vi.fn(),
                delete: vi.fn(),
            });

            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 5, // Between "Hello" and "World"
                isActive: true,
                userId: "user-1",
            });

            cursor.insertLineBreak();

            // Should split the text at the cursor position
            expect(mockItem.updateText).toHaveBeenCalledWith("Hello");
            // Check if either parent.addNode or mockParentItem.items.addNode was called
            expect(
                (mockItem.parent as typeof mockItem.parent & { addNode?: () => unknown; })?.addNode
                    || mockParentItem.items.addNode,
            ).toHaveBeenCalled();
        });
    });

    describe("Selection Operations", () => {
        it("should extend selection to the left", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 10,
                isActive: true,
                userId: "user-1",
            });

            cursor.extendSelectionLeft();

            // Should have created a selection
            expect(editorOverlayStore.setSelection).toHaveBeenCalled();
        });

        it("should extend selection to the right", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 5,
                isActive: true,
                userId: "user-1",
            });

            cursor.extendSelectionRight();

            // Should have created a selection
            expect(editorOverlayStore.setSelection).toHaveBeenCalled();
        });
    });

    describe("Keyboard Event Handling", () => {
        it("should handle arrow key events", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 5,
                isActive: true,
                userId: "user-1",
            });

            const leftEvent = new KeyboardEvent("keydown", { key: "ArrowLeft" });
            const rightEvent = new KeyboardEvent("keydown", { key: "ArrowRight" });
            const upEvent = new KeyboardEvent("keydown", { key: "ArrowUp" });
            const downEvent = new KeyboardEvent("keydown", { key: "ArrowDown" });

            // Test that events are handled
            expect(cursor.onKeyDown(leftEvent)).toBe(true);
            expect(cursor.onKeyDown(rightEvent)).toBe(true);
            expect(cursor.onKeyDown(upEvent)).toBe(true);
            expect(cursor.onKeyDown(downEvent)).toBe(true);
        });

        it("should handle special key combinations", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 5,
                isActive: true,
                userId: "user-1",
            });

            const ctrlAEvent = new KeyboardEvent("keydown", { key: "a", ctrlKey: true });
            const ctrlCEvent = new KeyboardEvent("keydown", { key: "c", ctrlKey: true });

            // Test that events are handled
            expect(cursor.onKeyDown(ctrlAEvent)).toBe(true);
            expect(cursor.onKeyDown(ctrlCEvent)).toBe(true);
        });
    });
});
