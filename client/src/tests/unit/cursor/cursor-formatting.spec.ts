import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../../schema/app-schema";
// Imports removed to avoid no-restricted-imports linter error
import { ScrapboxFormatter } from "../../../utils/ScrapboxFormatter";

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
    let Cursor: any;
    let editorOverlayStore: any;
    let generalStore: any;

    beforeEach(async () => {
        // Reset modules to ensure clean mocks
        vi.resetModules();

        // Setup mock implementations
        const mockOverlayStore = {
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
            selections: {},
        };

        const mockGeneralStore = {
            currentPage: null,
            project: null,
        };

        // Use doMock to mock modules for the upcoming import
        // Mock both .svelte and .svelte.ts versions to catch all import variations
        vi.doMock("../../../stores/EditorOverlayStore.svelte.ts", () => ({
            editorOverlayStore: mockOverlayStore,
            store: mockOverlayStore,
        }));
        vi.doMock("../../../stores/EditorOverlayStore.svelte", () => ({
            editorOverlayStore: mockOverlayStore,
            store: mockOverlayStore,
        }));

        vi.doMock("../../../stores/store.svelte.ts", () => ({ store: mockGeneralStore }));
        vi.doMock("../../../stores/store.svelte", () => ({ store: mockGeneralStore }));

        // Dynamically import Cursor after setting up mocks
        const cursorModule = await import("../../../lib/Cursor");
        Cursor = cursorModule.Cursor;

        // Assign to local variables for use in tests
        editorOverlayStore = mockOverlayStore as any;
        generalStore = mockGeneralStore as any;

        // Create mock item
        mockItem = {
            id: "test-item-1",
            text: "This is a test text for formatting",
            parent: null,
            items: {
                [Symbol.iterator]: function*() {
                    // Empty iterator
                },
            },
            updateText: vi.fn(),
            delete: vi.fn(),
        } as unknown as Item;

        // Setup general store state
        generalStore.currentPage = {
            id: "page-1",
            text: "page",
            parent: null,
            items: {
                [Symbol.iterator]: function*() {
                    yield mockItem;
                },
            },
            updateText: vi.fn(),
            delete: vi.fn(),
        } as unknown as Item;

        console.log("Test setup complete. General store currentPage:", generalStore.currentPage);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Bold Formatting", () => {
        it("should apply bold formatting to selected text", () => {
            mockItem.updateText = vi.fn();

            // Mock a selection
            editorOverlayStore.selections = {
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
            editorOverlayStore.selections = {
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
            editorOverlayStore.selections = {
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
            editorOverlayStore.selections = {
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
