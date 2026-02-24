import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyEventHandler } from "./KeyEventHandler";

// Mock stores to avoid circular dependency
vi.mock("../stores/CommandPaletteStore.svelte", () => ({
    commandPaletteStore: {
        isVisible: false,
        hide: vi.fn(),
    },
}));

vi.mock("../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: {
        isVisible: false,
        hide: vi.fn(),
    },
}));

// Svelte store mock
vi.mock("../stores/EditorOverlayStore.svelte", () => {
    const mockIndent = vi.fn();
    const mockOutdent = vi.fn();

    // Store mocks in global for test access
    (globalThis as any).__testMocks = {
        mockIndent,
        mockOutdent,
    };

    return {
        editorOverlayStore: {
            getCursorInstances: () => [{
                indent: mockIndent,
                outdent: mockOutdent,
                onKeyDown: vi.fn(),
                findTarget: () => ({ text: "some text" }),
                offset: 0,
                cursorId: "cursor-1",
                itemId: "item-1",
                isActive: true,
                userId: "local"
            }],
            getTextareaRef: vi.fn(() => ({ focus: vi.fn() })),
            selections: {},
        },
    };
});

describe("KeyEventHandler Tab Handling", () => {
    let mockIndent: any;
    let mockOutdent: any;
    let originalDocument: any;

    beforeEach(() => {
        vi.clearAllMocks();
        const mocks = (globalThis as any).__testMocks;
        mockIndent = mocks.mockIndent;
        mockOutdent = mocks.mockOutdent;

        // Reset key handlers to ensure they are re-initialized
        if ((KeyEventHandler as any).keyHandlers) {
            (KeyEventHandler as any).keyHandlers.clear();
        }

        // Mock document
        originalDocument = global.document;
        global.document = {
            activeElement: { tagName: "BODY" },
            querySelector: vi.fn(),
            querySelectorAll: vi.fn(() => []),
            dispatchEvent: vi.fn(),
            createElement: vi.fn(() => ({ style: {} })),
            body: { appendChild: vi.fn(), removeChild: vi.fn() },
        } as any;

        // Mock requestAnimationFrame
        (global as any).requestAnimationFrame = (cb: any) => cb();
    });

    afterEach(() => {
        global.document = originalDocument;
        delete (global as any).requestAnimationFrame;
    });

    const createKeyEvent = (key: string, shiftKey: boolean = false): KeyboardEvent => {
        return {
            key,
            shiftKey,
            ctrlKey: false,
            altKey: false,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            target: { tagName: "DIV" },
        } as unknown as KeyboardEvent;
    };

    it("calls indent on Tab key press and prevents default", () => {
        const event = createKeyEvent("Tab");
        KeyEventHandler.handleKeyDown(event);

        expect(mockIndent).toHaveBeenCalled();
        expect(event.preventDefault).toHaveBeenCalled();
    });

    it("calls outdent on Shift+Tab key press and prevents default", () => {
        const event = createKeyEvent("Tab", true);
        KeyEventHandler.handleKeyDown(event);

        expect(mockOutdent).toHaveBeenCalled();
        expect(event.preventDefault).toHaveBeenCalled();
    });
});
