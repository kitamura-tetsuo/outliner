import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
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

interface GlobalTestMocks {
    mockIndent: Mock;
    mockOutdent: Mock;
}

// Svelte store mock
vi.mock("../stores/EditorOverlayStore.svelte", () => {
    const mockIndent = vi.fn();
    const mockOutdent = vi.fn();

    // Store mocks in global for test access
    (globalThis as unknown as { __testMocks: GlobalTestMocks; }).__testMocks = {
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
                userId: "local",
            }],
            getTextareaRef: vi.fn(() => ({ focus: vi.fn() })),
            selections: {},
        },
    };
});

describe("KeyEventHandler Tab Handling", () => {
    let mockIndent: Mock;
    let mockOutdent: Mock;
    let originalDocument: Document | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        const mocks = (globalThis as unknown as { __testMocks: GlobalTestMocks; }).__testMocks;
        mockIndent = mocks.mockIndent;
        mockOutdent = mocks.mockOutdent;

        // Reset key handlers to ensure they are re-initialized
        if ((KeyEventHandler as unknown as { keyHandlers: Map<unknown, unknown>; }).keyHandlers) {
            (KeyEventHandler as unknown as { keyHandlers: Map<unknown, unknown>; }).keyHandlers.clear();
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
        } as unknown as Document;

        // Mock requestAnimationFrame
        (global as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number; }).requestAnimationFrame =
            (cb: FrameRequestCallback) => {
                cb(0);
                return 0;
            };
    });

    afterEach(() => {
        if (originalDocument) {
            global.document = originalDocument;
        }
        delete (global as unknown as { requestAnimationFrame?: unknown; }).requestAnimationFrame;
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
