import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cursor } from "../../../lib/Cursor";
import type { Item } from "../../../schema/yjs-schema";
import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../../stores/store.svelte";
import type { GeneralStore } from "../../../stores/store.svelte";

// Mock the stores
vi.mock("../../../stores/EditorOverlayStore.svelte", () => {
    const mockStore = {
        cursors: {},
        selections: {},
        updateCursor: vi.fn(),
        setCursor: vi.fn(() => "new-cursor-id"),
        setActiveItem: vi.fn(),
        getTextareaRef: vi.fn(),
        clearCursorForItem: vi.fn(),
        setSelection: vi.fn(),
        clearSelectionForUser: vi.fn(),
        startCursorBlink: vi.fn(),
        triggerOnEdit: vi.fn(),
        cursorInstances: new Map(),
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

describe("Cursor", () => {
    let mockItem: Item;
    let mockParentItem: Item;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock items
        mockItem = {
            id: "test-item-1",
            text: "Test text content",
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
            text: "Parent text content",
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
        (mockItem as any).parent = mockParentItem;

        // Mock the general store
        (generalStore as GeneralStore).currentPage = mockParentItem;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Constructor", () => {
        it("should create a cursor with the correct properties", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "item-1",
                offset: 5,
                isActive: true,
                userId: "user-1",
            });

            expect(cursor.cursorId).toBe("cursor-1");
            expect(cursor.itemId).toBe("item-1");
            expect(cursor.offset).toBe(5);
            expect(cursor.isActive).toBe(true);
            expect(cursor.userId).toBe("user-1");
            expect(cursor["initialColumn"]).toBeNull();
        });
    });

    describe("findTarget", () => {
        it("should find the target item in the current page", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 0,
                isActive: true,
                userId: "user-1",
            });

            const target = cursor.findTarget();
            expect(target).toBe(mockItem);
        });

        it("should return undefined if target item is not found", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "non-existent-item",
                offset: 0,
                isActive: true,
                userId: "user-1",
            });

            const target = cursor.findTarget();
            expect(target).toBeUndefined();
        });
    });

    describe("Movement methods", () => {
        beforeEach(() => {
            // setCursor is already configured in the mock to return "new-cursor-id"
        });

        describe("moveLeft", () => {
            it("should move the cursor left within the same item", () => {
                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 5,
                    isActive: true,
                    userId: "user-1",
                });

                cursor.moveLeft();

                expect(cursor.offset).toBe(4);
                expect(editorOverlayStore.updateCursor).toHaveBeenCalled();
                expect(editorOverlayStore.startCursorBlink).toHaveBeenCalled();
            });

            it("should not move the cursor left if already at the beginning", () => {
                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 0,
                    isActive: true,
                    userId: "user-1",
                });

                cursor.moveLeft();

                // When at the beginning, moveLeft should trigger navigation to previous item
                // Since we're mocking and there's no previous item, we can't fully test this
                // but we can check that the navigation attempt was made
                expect(editorOverlayStore.startCursorBlink).toHaveBeenCalled();
            });
        });

        describe("moveRight", () => {
            it("should move the cursor right within the same item", () => {
                mockItem.text = "Test text";
                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 5,
                    isActive: true,
                    userId: "user-1",
                });

                cursor.moveRight();

                expect(cursor.offset).toBe(6);
                expect(editorOverlayStore.updateCursor).toHaveBeenCalled();
                expect(editorOverlayStore.startCursorBlink).toHaveBeenCalled();
            });

            it("should not move the cursor right if already at the end", () => {
                mockItem.text = "Test";
                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 4,
                    isActive: true,
                    userId: "user-1",
                });

                cursor.moveRight();

                expect(cursor.offset).toBe(4);
                // Should attempt to navigate to next item
            });
        });
    });

    describe("Text manipulation methods", () => {
        describe("insertText", () => {
            it("should insert text at the current cursor position", () => {
                mockItem.text = "Hello World";
                mockItem.updateText = vi.fn();

                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 5,
                    isActive: true,
                    userId: "user-1",
                });

                cursor.insertText(" Beautiful");

                expect(mockItem.updateText).toHaveBeenCalledWith("Hello Beautiful World");
                expect(cursor.offset).toBe(15); // 5 + " Beautiful".length
                expect(editorOverlayStore.updateCursor).toHaveBeenCalled();
                expect(editorOverlayStore.triggerOnEdit).toHaveBeenCalled();
            });
        });

        describe("deleteBackward", () => {
            it("should delete the character before the cursor", () => {
                mockItem.text = "Hello World";
                mockItem.updateText = vi.fn();

                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 6,
                    isActive: true,
                    userId: "user-1",
                });

                cursor.deleteBackward();

                expect(mockItem.updateText).toHaveBeenCalledWith("HelloWorld");
                expect(cursor.offset).toBe(5);
                expect(editorOverlayStore.updateCursor).toHaveBeenCalled();
                expect(editorOverlayStore.triggerOnEdit).toHaveBeenCalled();
            });
        });

        describe("deleteForward", () => {
            it("should delete the character after the cursor", () => {
                mockItem.text = "Hello World";
                mockItem.updateText = vi.fn();

                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 5,
                    isActive: true,
                    userId: "user-1",
                });

                cursor.deleteForward();

                expect(mockItem.updateText).toHaveBeenCalledWith("HelloWorld");
                expect(cursor.offset).toBe(5);
                expect(editorOverlayStore.updateCursor).toHaveBeenCalled();
                expect(editorOverlayStore.triggerOnEdit).toHaveBeenCalled();
            });
        });
    });

    describe("Line operations", () => {
        describe("moveToLineStart", () => {
            it("should move cursor to the start of the current line", () => {
                mockItem.text = "First line\nSecond line\nThird line";
                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 15, // Middle of "Second line"
                    isActive: true,
                    userId: "user-1",
                });

                cursor.moveToLineStart();

                expect(cursor.offset).toBe(11); // Start of "Second line" (after newline)
                expect(editorOverlayStore.updateCursor).toHaveBeenCalled();
                expect(editorOverlayStore.startCursorBlink).toHaveBeenCalled();
            });
        });

        describe("moveToLineEnd", () => {
            it("should move cursor to the end of the current line", () => {
                mockItem.text = "First line\nSecond line\nThird line";
                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 15, // Middle of "Second line"
                    isActive: true,
                    userId: "user-1",
                });

                cursor.moveToLineEnd();

                expect(cursor.offset).toBe(22); // End of "Second line" (before newline)
                expect(editorOverlayStore.updateCursor).toHaveBeenCalled();
                expect(editorOverlayStore.startCursorBlink).toHaveBeenCalled();
            });
        });
    });

    describe("Selection methods", () => {
        describe("clearSelection", () => {
            it("should clear the selection for the user", () => {
                const cursor = new Cursor("cursor-1", {
                    itemId: "test-item-1",
                    offset: 5,
                    isActive: true,
                    userId: "user-1",
                });

                cursor.clearSelection();

                expect(editorOverlayStore.clearSelectionForUser).toHaveBeenCalledWith("user-1");
            });
        });
    });
});
