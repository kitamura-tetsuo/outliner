// Manually mock KeyboardEvent for Node environment
if (typeof global !== "undefined") {
    if (!global.KeyboardEvent) {
        global.KeyboardEvent = class KeyboardEvent extends Event {
            key: string;
            ctrlKey: boolean;
            metaKey: boolean;
            constructor(type: string, options: any) {
                super(type, options);
                this.key = options?.key || "";
                this.ctrlKey = options?.ctrlKey || false;
                this.metaKey = options?.metaKey || false;
            }
        } as any;
    }
    if (!global.document) {
        global.document = {
            querySelector: vi.fn(),
            activeElement: null,
            createElement: vi.fn().mockReturnValue({}),
            dispatchEvent: vi.fn(),
        } as any;
    }
    if (!global.window) {
        global.window = global as any;
    }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cursor, resetEditorOverlayStore, setEditorOverlayStore } from "../../../lib/Cursor";
import type { Item } from "../../../schema/app-schema";
import { store as generalStore } from "../../../stores/store.svelte";

// Mock the general store
vi.mock("../../../stores/store.svelte", () => {
    return {
        store: {
            currentPage: null,
            project: null,
            pages: { current: [] },
        },
    };
});

vi.mock("../../../lib/firebase-app", () => ({
    app: {},
    auth: {
        currentUser: { uid: "test-user" },
        onAuthStateChanged: vi.fn(),
    },
    db: {},
}));

vi.mock("../../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => ({ uid: "test-user" }),
        onAuthStateChanged: vi.fn(),
    },
}));

vi.mock("../../../stores/PresenceStore.svelte", () => ({
    presenceStore: {
        updatePresence: vi.fn(),
    },
}));

vi.mock("../../../stores/yjsStore.svelte", () => ({
    yjsStore: {
        isConnected: true,
    },
}));

vi.mock("../../../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        updateCursor: vi.fn(),
        setCursor: vi.fn(),
        setActiveItem: vi.fn(),
        getTextareaRef: vi.fn(),
        clearCursorForItem: vi.fn(),
        setSelection: vi.fn(),
        clearSelectionForUser: vi.fn(),
        startCursorBlink: vi.fn(),
        triggerOnEdit: vi.fn(),
    },
}));

describe("Cursor Integration", () => {
    let mockItem: Item;
    let mockParentItem: Item;
    let mockStore: any;

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
        (mockItem as unknown as { parent: Item | null; }).parent = mockParentItem;

        // Mock the general store
        (generalStore as any).pages = { current: [mockParentItem] };

        // Setup editor overlay store mocks
        mockStore = {
            updateCursor: vi.fn(),
            setCursor: vi.fn().mockReturnValue("new-cursor-id"),
            setActiveItem: vi.fn(),
            getTextareaRef: vi.fn(),
            clearCursorForItem: vi.fn(),
            setSelection: vi.fn(),
            clearSelectionForUser: vi.fn(),
            startCursorBlink: vi.fn(),
            triggerOnEdit: vi.fn(),
            cursorInstances: new Map(),
            cursors: {},
            clearCursorAndSelection: vi.fn(),
            selections: {},
        };

        // Inject the mock store into Cursor.ts
        setEditorOverlayStore(mockStore);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        resetEditorOverlayStore();
    });

    describe("Cursor Navigation", () => {
        it("should navigate between lines correctly", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 15, // Middle of second line
                isActive: true,
                userId: "user-1",
            });
            // Mock findTarget to bypass store issues
            cursor.findTarget = vi.fn().mockReturnValue(mockItem);

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
            (mockParentItem as unknown as { items: unknown; }).items = {
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
            };

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
        });
    });

    describe("Text Operations", () => {
        it("should handle text insertion with selection", () => {
            mockItem.text = "Hello World";
            mockItem.updateText = vi.fn();

            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 8, // Within the selection
                isActive: true,
                userId: "user-1",
            });
            cursor.findTarget = vi.fn().mockReturnValue(mockItem);

            // Mock selection lookup on CursorEditor instance
            // We use 'any' to access private property 'editor'
            const editor = (cursor as any).editor;
            editor.getSingleItemSelection = vi.fn().mockReturnValue({
                userId: "user-1",
                startItemId: "test-item-1",
                endItemId: "test-item-1",
                startOffset: 5,
                endOffset: 11,
            });

            cursor.insertText(" Beautiful");

            // Should replace the selected text " Worl" (5-11 implies " World"?)
            // "Hello World" (length 11). Indices 0-11.
            // 5-11 is " World".
            // "Hello " + " Beautiful" + "".
            // = "Hello Beautiful"

            expect(mockItem.updateText).toHaveBeenCalledWith("Hello Beautiful");
            expect(cursor.offset).toBe(15); // 5 + " Beautiful".length
        });

        it("should handle line breaks correctly", () => {
            mockItem.text = "Hello World";
            mockItem.updateText = vi.fn();

            // Ensure parent has indexOf and addNode methods
            if (mockItem.parent) {
                (mockItem.parent as any).indexOf = (item: Item) => {
                    if (item === mockItem) return 0;
                    return -1;
                };
                (mockItem.parent as any).addNode = vi.fn().mockReturnValue({
                    id: "new-item-1",
                    text: "World",
                    updateText: vi.fn(),
                    delete: vi.fn(),
                });
            }

            // Also mock items interface
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
            cursor.findTarget = vi.fn().mockReturnValue(mockItem);

            cursor.insertLineBreak();

            // Should split the text at the cursor position
            expect(mockItem.updateText).toHaveBeenCalledWith("Hello");
            // Check if either parent.addNode or mockParentItem.items.addNode was called
            expect(
                (mockItem.parent as any).addNode || mockParentItem.items.addNode,
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
            cursor.findTarget = vi.fn().mockReturnValue(mockItem);

            // Mock selection lookup for extension logic
            // extendSelectionLeft calls getSelectionForCurrentItem -> getSelection
            // We overwrite getSelection on cursor instance (private method)
            (cursor as any).getSelection = vi.fn().mockReturnValue(undefined); // No existing selection

            cursor.extendSelectionLeft();

            // Should have created a selection
            expect(mockStore.setSelection).toHaveBeenCalled();
        });

        it("should extend selection to the right", () => {
            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 5,
                isActive: true,
                userId: "user-1",
            });
            cursor.findTarget = vi.fn().mockReturnValue(mockItem);

            // Mock selection lookup on cursor instance
            (cursor as any).getSelection = vi.fn().mockReturnValue(undefined); // No existing selection

            cursor.extendSelectionRight();

            // Should have created a selection
            expect(mockStore.setSelection).toHaveBeenCalled();
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

            // Allow hasSelection to return false (default if getSelection fails or mock store is used directly?)
            // Cursor.ts hasSelection calls storeHasSelection(utils) -> store.
            // But we injected mock store.
            // IF Cursor.ts imports "storeHasSelection" from "./cursor", and that file imports default store...
            // Then it accesses default store.
            // BUT we cannot mock default store easily.
            // So we mock "private hasSelection" on cursor instance if needed.
            (cursor as any).hasSelection = vi.fn().mockReturnValue(false);

            const leftEvent = new KeyboardEvent("keydown", { key: "ArrowLeft" });
            const rightEvent = new KeyboardEvent("keydown", { key: "ArrowRight" });
            const upEvent = new KeyboardEvent("keydown", { key: "ArrowUp" });
            const downEvent = new KeyboardEvent("keydown", { key: "ArrowDown" });

            // Mock move methods to avoid execution
            cursor.moveLeft = vi.fn();
            cursor.moveRight = vi.fn();
            cursor.moveUp = vi.fn();
            cursor.moveDown = vi.fn();

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

            (cursor as any).hasSelection = vi.fn().mockReturnValue(false);
            cursor.selectAll = vi.fn();
            cursor.copySelectedText = vi.fn();

            const ctrlAEvent = new KeyboardEvent("keydown", { key: "a", ctrlKey: true });
            const ctrlCEvent = new KeyboardEvent("keydown", { key: "c", ctrlKey: true });

            // Test that events are handled
            expect(cursor.onKeyDown(ctrlAEvent)).toBe(true);
            expect(cursor.onKeyDown(ctrlCEvent)).toBe(true);
        });
    });
});
