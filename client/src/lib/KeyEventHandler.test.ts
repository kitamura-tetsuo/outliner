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

// Svelte store mock as permitted by AGENTS.md
vi.mock("../stores/EditorOverlayStore.svelte", () => {
    const mockInsertText = vi.fn();
    const mockClearSelections = vi.fn();
    const mockStartCursorBlink = vi.fn();
    let selections: Record<string, unknown> = {};

    // Store mocks in global for test access
    (globalThis as Window & typeof globalThis & { __testMocks: Record<string, unknown>; }).__testMocks = {
        mockInsertText,
        mockClearSelections,
        mockStartCursorBlink,
    };

    return {
        editorOverlayStore: {
            getCursorInstances: () => [{ insertText: mockInsertText }],
            get selections() {
                return selections;
            },
            set selections(value) {
                selections = value;
            },
            clearSelections: mockClearSelections,
            startCursorBlink: mockStartCursorBlink,
        },
    };
});

describe("KeyEventHandler.handlePaste", () => {
    // Get mocked functions from global
    const { mockInsertText } =
        (globalThis as Window & typeof globalThis & { __testMocks: Record<string, unknown>; }).__testMocks;

    beforeEach(() => {
        vi.clearAllMocks();
        (window as Window & typeof globalThis & { lastCopiedText?: string; }).lastCopiedText = undefined;
    });

    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (navigator as any).clipboard;
    });

    const createEvent = (text: string): ClipboardEvent => {
        const clipboardData = {
            getData: vi.fn((_format: string) => text), // eslint-disable-line @typescript-eslint/no-unused-vars
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any as DataTransfer;
        return {
            clipboardData,
            preventDefault: vi.fn(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any as ClipboardEvent;
    };

    it("inserts clipboard text when available", async () => {
        const event = createEvent("hello world");
        await KeyEventHandler.handlePaste(event);
        expect(mockInsertText).toHaveBeenCalledWith("hello world");
        expect(event.preventDefault).toHaveBeenCalled();
    });

    it("dispatches permission denied event and skips insert", async () => {
        const event = createEvent("");
        const listener = vi.fn();
        window.addEventListener("clipboard-permission-denied", listener);
        Object.defineProperty(navigator, "clipboard", {
            value: { readText: () => Promise.reject({ name: "NotAllowedError" }) },
            configurable: true,
        });
        await KeyEventHandler.handlePaste(event);
        expect(listener).toHaveBeenCalled();
        expect(mockInsertText).not.toHaveBeenCalled();
        window.removeEventListener("clipboard-permission-denied", listener);
    });

    it("dispatches read error event and skips insert", async () => {
        const event = createEvent("");
        const listener = vi.fn();
        window.addEventListener("clipboard-read-error", listener);
        Object.defineProperty(navigator, "clipboard", {
            value: { readText: () => Promise.reject({ name: "UnknownError" }) },
            configurable: true,
        });
        await KeyEventHandler.handlePaste(event);
        expect(listener).toHaveBeenCalled();
        expect(mockInsertText).not.toHaveBeenCalled();
        window.removeEventListener("clipboard-read-error", listener);
    });

    it("falls back to global lastCopiedText when clipboard empty", async () => {
        const event = createEvent("");
        (window as Window & typeof globalThis & { lastCopiedText?: string; }).lastCopiedText = "fallback";
        Object.defineProperty(navigator, "clipboard", {
            value: { readText: () => Promise.resolve("") },
            configurable: true,
        });
        await KeyEventHandler.handlePaste(event);
        expect(mockInsertText).toHaveBeenCalledWith("fallback");
    });

    it("dispatches read error when cursor insertion throws", async () => {
        const event = createEvent("oops");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockInsertText as any).mockImplementationOnce(() => {
            throw new Error("boom");
        });
        const listener = vi.fn();
        window.addEventListener("clipboard-read-error", listener);
        await KeyEventHandler.handlePaste(event);
        expect(listener).toHaveBeenCalled();
        window.removeEventListener("clipboard-read-error", listener);
    });
});
