import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cursor } from "../../../lib/Cursor";
import type { Item } from "../../../schema/yjs-schema";
import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../../stores/store.svelte";
import { ScrapboxFormatter } from "../../../utils/ScrapboxFormatter";

// Mock the stores
vi.mock("../../../stores/EditorOverlayStore.svelte", () => {
    const mockStore = {
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

// Mock the ScrapboxFormatter
vi.mock("../../../utils/ScrapboxFormatter", () => {
    return {
        ScrapboxFormatter: {
            bold: vi.fn((text) => `[[${text}]]`),
            italic: vi.fn((text) => `[/ ${text}]`),
            strikethrough: vi.fn((text) => `[-${text}]`),
            underline: vi.fn((text) => `[~${text}]`),
            code: vi.fn((text) => `\`${text}\``),
        },
    };
});

describe("Cursor Formatting", () => {
    let mockItem: Item;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock text object
        const mockItemText = {
            value: "This is a test text for formatting",
            toString() {
                return this.value;
            },
            get length() {
                return this.value.length;
            },
            delete(start: number, count: number) {
                this.value = (this.value || "").slice(0, start) + (this.value || "").slice(start + count);
            },
            insert(pos: number, text: string) {
                this.value = (this.value || "").slice(0, pos) + text + (this.value || "").slice(pos);
            },
        };

        // Create mock item
        mockItem = {
            id: "test-item-1",
            parent: null,
            items: {
                [Symbol.iterator]: function*() {
                    // Empty iterator
                },
            },
            updateText: vi.fn(),
            delete: vi.fn(),
            get text() {
                return mockItemText as any;
            },
        } as unknown as Item;

        // Mock the general store
        (generalStore as any).currentPage = {
            id: "page-1",
            items: {
                [Symbol.iterator]: function*() {
                    yield mockItem;
                },
            },
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Bold Formatting", () => {
        it("should apply bold formatting to selected text", () => {
            mockItem.updateText = vi.fn();

            // Mock a selection
            (editorOverlayStore as any).selections = {
                "selection-1": {
                    userId: "user-1",
                    startItemId: "test-item-1",
                    endItemId: "test-item-1",
                    startOffset: 10,
                    endOffset: 14,
                },
            };

            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 12,
                isActive: true,
                userId: "user-1",
            });

            cursor.formatBold();

            // Should apply bold formatting to "test"
            expect(mockItem.updateText).toHaveBeenCalledWith("This is a [[test]] text for formatting");
            expect(ScrapboxFormatter.bold).toHaveBeenCalledWith("test");
            expect(cursor.offset).toBe(18); // Position after the formatted text "[[test]]" (10 + 8)
        });
    });

    describe("Italic Formatting", () => {
        it("should apply italic formatting to selected text", () => {
            mockItem.updateText = vi.fn();

            // Mock a selection
            (editorOverlayStore as any).selections = {
                "selection-1": {
                    userId: "user-1",
                    startItemId: "test-item-1",
                    endItemId: "test-item-1",
                    startOffset: 10,
                    endOffset: 14,
                },
            };

            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 12,
                isActive: true,
                userId: "user-1",
            });

            cursor.formatItalic();

            // Should apply italic formatting to "test"
            expect(mockItem.updateText).toHaveBeenCalledWith("This is a [/ test] text for formatting");
            expect(ScrapboxFormatter.italic).toHaveBeenCalledWith("test");
            expect(cursor.offset).toBe(18); // Position after the formatted text "[/ test]" (10 + 8)
        });
    });

    describe("Strikethrough Formatting", () => {
        it("should apply strikethrough formatting to selected text", () => {
            mockItem.updateText = vi.fn();

            // Mock a selection
            (editorOverlayStore as any).selections = {
                "selection-1": {
                    userId: "user-1",
                    startItemId: "test-item-1",
                    endItemId: "test-item-1",
                    startOffset: 10,
                    endOffset: 14,
                },
            };

            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 12,
                isActive: true,
                userId: "user-1",
            });

            cursor.formatStrikethrough();

            // Should apply strikethrough formatting to "test"
            expect(mockItem.updateText).toHaveBeenCalledWith("This is a [-test] text for formatting");
            expect(ScrapboxFormatter.strikethrough).toHaveBeenCalledWith("test");
            expect(cursor.offset).toBe(17); // Position after the formatted text "[-test]" (10 + 7)
        });
    });

    describe("Code Formatting", () => {
        it("should apply code formatting to selected text", () => {
            mockItem.updateText = vi.fn();

            // Mock a selection
            (editorOverlayStore as any).selections = {
                "selection-1": {
                    userId: "user-1",
                    startItemId: "test-item-1",
                    endItemId: "test-item-1",
                    startOffset: 10,
                    endOffset: 14,
                },
            };

            const cursor = new Cursor("cursor-1", {
                itemId: "test-item-1",
                offset: 12,
                isActive: true,
                userId: "user-1",
            });

            cursor.formatCode();

            // Should apply code formatting to "test"
            expect(mockItem.updateText).toHaveBeenCalledWith("This is a `test` text for formatting");
            expect(ScrapboxFormatter.code).toHaveBeenCalledWith("test");
            expect(cursor.offset).toBe(16); // Position after the formatted text "`test`" (10 + 6)
        });
    });
});
