import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { Cursor } from "./Cursor";
import type { Item } from "../schema/app-schema";

// Helper to manage mock selection state
let mockSelection: any = undefined;

// Mocks for stores
vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        subscribe: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
        updateCursor: vi.fn(),
        setCursor: vi.fn((opts: any) => `cursor-${opts.itemId}-${Math.random()}`),
        setActiveItem: vi.fn(),
        getTextareaRef: vi.fn(() => ({
            focus: vi.fn(),
            value: "",
            selectionStart: 0,
            selectionEnd: 0,
            setSelectionRange: vi.fn(),
        })),
        startCursorBlink: vi.fn(),
        triggerOnEdit: vi.fn(),
        clearCursorForItem: vi.fn(),
        clearCursorAndSelection: vi.fn(),
        clearSelectionForUser: vi.fn(),
        setSelection: vi.fn((sel) => {
            // Update the mock selection when setSelection is called
            mockSelection = { ...sel };
            return "selection-id";
        }),
        selections: {},
        cursorInstances: new Map(),
        cursors: {},
        forceUpdate: vi.fn(),
    },
}));

vi.mock("../stores/store.svelte", () => ({
    store: {
        currentPage: undefined,
        subscribe: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
    },
}));

// Mock cursor utility functions
vi.mock("./cursor", async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        findNextItem: (itemId: string) => {
            if (itemId === "item1") return { id: "item2", text: "World" };
            if (itemId === "item2") return { id: "item3", text: "Test" };
            return null;
        },
        findPreviousItem: (itemId: string) => {
            if (itemId === "item3") return { id: "item2", text: "World" };
            if (itemId === "item2") return { id: "item1", text: "Hello" };
            return null;
        },
        getSelectionForUser: () => mockSelection,
        hasSelection: () => !!mockSelection,
        searchItem: (root: any, itemId: string) => {
            if (itemId === "item1") return { id: "item1", text: "Hello" };
            if (itemId === "item2") return { id: "item2", text: "World" };
            if (itemId === "item3") return { id: "item3", text: "Test" };
            return null;
        },
        getCurrentColumn: (text: string, offset: number) => offset,
        // Mock other functions used by Cursor if necessary
        getVisualLineInfo: () => null, // Force fallback to logical lines
        getLineStartOffset: (text: string, lineIndex: number) => 0, // Simplified
        getLineEndOffset: (text: string, lineIndex: number) => text.length, // Simplified
        getCurrentLineIndex: () => 0, // Simplified
    };
});

describe("Cursor Selection Reproduction", () => {
    let cursor: Cursor;
    let mockItems: Item[];

    beforeEach(async () => {
        vi.clearAllMocks();
        mockSelection = undefined;

        // Setup mock items
        mockItems = [
            { id: "item1", text: "Hello" } as Item,
            { id: "item2", text: "World" } as Item,
            { id: "item3", text: "Test" } as Item
        ];

        // Setup store
        const { store: generalStore } = await import("../stores/store.svelte");
        generalStore.currentPage = {
            id: "page1",
            items: mockItems
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
            userId: "test-user"
        });

        // Spy on findTarget to return mock items
        vi.spyOn(cursor as any, "findTarget").mockImplementation(() => {
            return mockItems.find(i => i.id === cursor.itemId);
        });

        // Ensure getTargetText works
        vi.spyOn(cursor as any, "getTargetText").mockImplementation((target: any) => target?.text || "");
    });

    afterEach(() => {
        mockSelection = undefined;
    });

    describe("Shift+Right Selection", () => {
        it("should create new selection to the right within same item", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            cursor.offset = 0;
            cursor.extendSelectionRight();

            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 1,
                isReversed: false
            }));
            expect(cursor.offset).toBe(1);
        });

        it("should extend existing selection to the right within same item", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            // Initial selection: 0->1
            mockSelection = {
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 1,
                isReversed: false,
                userId: "test-user"
            };
            cursor.offset = 1;

            cursor.extendSelectionRight();

            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 2,
                isReversed: false
            }));
            expect(cursor.offset).toBe(2);
        });

        it("should shrink reversed selection when moving right", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            // Initial selection: 2->1 (reversed)
            mockSelection = {
                startItemId: "item1",
                startOffset: 2,
                endItemId: "item1",
                endOffset: 1,
                isReversed: true,
                userId: "test-user"
            };
            cursor.offset = 1;

            cursor.extendSelectionRight();

            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 2, // Anchor stays
                endItemId: "item1",
                endOffset: 2,   // Cursor moves right
                isReversed: false // Collapsed selection is not reversed
            }));
            // The logic:
            // reversed -> modify start (which is logically the left side, but visually the "end" of reversed selection?)
            // Wait, in reversed selection (start > end), start is anchor, end is focus.
            // If we move right, we increase endOffset.
            // 1 -> 2. So start=2, end=2.

            expect(cursor.offset).toBe(2);
        });

        it("should extend selection to next item", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            cursor.offset = 5; // End of "Hello"
            cursor.extendSelectionRight();

            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 5,
                endItemId: "item2",
                endOffset: 0,
                isReversed: false
            }));
            expect(cursor.itemId).toBe("item2");
            expect(cursor.offset).toBe(0);
        });
    });

    describe("Shift+Left Selection", () => {
        it("should create new selection to the left within same item", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            cursor.offset = 5; // End of "Hello"
            cursor.extendSelectionLeft();

            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 5,
                endItemId: "item1",
                endOffset: 4,
                isReversed: true
            }));
            expect(cursor.offset).toBe(4);
        });

        it("should extend existing reversed selection to the left", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            // Initial selection: 5->4 (reversed)
            mockSelection = {
                startItemId: "item1",
                startOffset: 5,
                endItemId: "item1",
                endOffset: 4,
                isReversed: true,
                userId: "test-user"
            };
            cursor.offset = 4;

            cursor.extendSelectionLeft();

            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 5, // Anchor
                endItemId: "item1",
                endOffset: 3,   // Focus moves left
                isReversed: true
            }));
            expect(cursor.offset).toBe(3);
        });

        it("should shrink normal selection when moving left", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            // Initial selection: 0->1 (normal)
            mockSelection = {
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 1,
                isReversed: false,
                userId: "test-user"
            };
            cursor.offset = 1;

            cursor.extendSelectionLeft();

            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 0,
                isReversed: false
            }));
            expect(cursor.offset).toBe(0);
        });

        it("should extend selection to previous item", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            cursor.itemId = "item2";
            cursor.offset = 0; // Start of "World"
            cursor.extendSelectionLeft();

            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item2",
                startOffset: 0,
                endItemId: "item1",
                endOffset: 5, // End of "Hello"
                isReversed: true
            }));
            expect(cursor.itemId).toBe("item1");
            expect(cursor.offset).toBe(5);
        });
    });

    describe("Direction Reversal", () => {
        it("should flip from normal to reversed when moving left past anchor", async () => {
            const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

            // Initial selection: 1->1 (collapsed/empty but exists as selection context)
            // Or assume we had 0->1 and shrank to 0->0.

            // Let's start with 0->1
            mockSelection = {
                startItemId: "item1",
                startOffset: 1, // Anchor at 1
                endItemId: "item1",
                endOffset: 1,   // Focus at 1 (shrunk)
                isReversed: false,
                userId: "test-user"
            };
            cursor.offset = 1;

            // Move left past anchor (1)
            cursor.extendSelectionLeft();

            // Should become 1->0, reversed
            expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                startItemId: "item1",
                startOffset: 1, // Anchor stays at 1
                endItemId: "item1",
                endOffset: 0,   // Focus moves to 0
                isReversed: true
            }));
        });

        it("should flip from reversed to normal when moving right past anchor", async () => {
             const { editorOverlayStore } = await import("../stores/EditorOverlayStore.svelte");

             // Initial selection: 1->1 (was reversed)
             mockSelection = {
                 startItemId: "item1",
                 startOffset: 1,
                 endItemId: "item1",
                 endOffset: 1,
                 isReversed: true,
                 userId: "test-user"
             };
             cursor.offset = 1;

             // Move right past anchor
             cursor.extendSelectionRight();

             // Should become 1->2, normal
             expect(editorOverlayStore.setSelection).toHaveBeenCalledWith(expect.objectContaining({
                 startItemId: "item1",
                 startOffset: 1,
                 endItemId: "item1",
                 endOffset: 2,
                 isReversed: false
             }));
        });
    });
});
