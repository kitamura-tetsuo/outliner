import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyEventHandler } from "./KeyEventHandler";

interface WindowWithAddRemoveEventListener extends Window {
    addEventListener?: typeof vi.fn;
    removeEventListener?: typeof vi.fn;
}

// Mock window addEventListener/removeEventListener for JSDOM environment
// This must be done before any tests run
if (typeof window !== "undefined") {
    // Delete existing property if it exists, then redefine it
    try {
        delete (window as WindowWithAddRemoveEventListener).addEventListener;
    } catch {}
    try {
        delete (window as WindowWithAddRemoveEventListener).removeEventListener;
    } catch {}

    Object.defineProperty(window, "addEventListener", {
        value: vi.fn(),
        writable: true,
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(window, "removeEventListener", {
        value: vi.fn(),
        writable: true,
        enumerable: true,
        configurable: true,
    });
}

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
    (globalThis as unknown as { __testMocks?: typeof mockInsertText; }).__testMocks = {
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
    const { mockInsertText } = (globalThis as unknown as { __testMocks?: typeof mockInsertText; }).__testMocks || {};

    beforeAll(() => {
        // window.addEventListener and removeEventListener are already mocked at module level
    });

    beforeEach(() => {
        // Ensure window is always a proper window object (not a string from previous tests)
        // Check this BEFORE trying to access window.dispatchEvent
        if (typeof window !== "object" || window === null || typeof window === "string") {
            (globalThis as typeof globalThis & { window?: typeof globalThis; }).window = globalThis;
        }
        // Ensure window has dispatchEvent (required for error handling in handlePaste)
        if (typeof window !== "undefined" && typeof window.dispatchEvent !== "function") {
            (window as unknown as { dispatchEvent: (event: Event) => boolean; }).dispatchEvent = vi.fn();
        }
        // Clear window.lastCopiedText property if it exists
        // Don't call vi.clearAllMocks() as it might affect window object
        if (
            typeof window !== "undefined" && window !== null && typeof window === "object" && "lastCopiedText" in window
        ) {
            delete (window as { lastCopiedText?: unknown; }).lastCopiedText;
        }
        if (
            typeof window !== "undefined" && window !== null && typeof window === "object"
            && "lastCopiedIsBoxSelection" in window
        ) {
            delete (window as { lastCopiedIsBoxSelection?: unknown; }).lastCopiedIsBoxSelection;
        }
    });

    afterEach(() => {
        delete (navigator as Navigator & { clipboard?: unknown; }).clipboard;
    });

    const createEvent = (text: string): ClipboardEvent => {
        const clipboardData = {
            getData: vi.fn((_format: string) => text), // eslint-disable-line @typescript-eslint/no-unused-vars
        } as unknown as DataTransfer;
        return {
            clipboardData,
            preventDefault: vi.fn(),
        } as unknown as ClipboardEvent;
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
        // Ensure window is the actual window object (not a string overwritten by previous tests)
        if (typeof window !== "object" || window === null) {
            (globalThis as typeof globalThis & { window?: typeof globalThis; }).window = globalThis;
        }
        // Mock dispatchEvent to call listeners directly
        const originalDispatchEvent = window.dispatchEvent?.bind(window);
        window.dispatchEvent = ((event: Event) => {
            if (event.type === "clipboard-permission-denied") {
                listener();
            }
            return true;
        }) as (event: Event) => boolean;
        Object.defineProperty(navigator, "clipboard", {
            value: { readText: () => Promise.reject({ name: "NotAllowedError" }) },
            configurable: true,
        });
        await KeyEventHandler.handlePaste(event);
        expect(listener).toHaveBeenCalled();
        expect(mockInsertText).not.toHaveBeenCalled();
        // Restore dispatchEvent
        window.dispatchEvent = originalDispatchEvent;
    });

    it("dispatches read error event and skips insert", async () => {
        const event = createEvent("");
        const listener = vi.fn();
        // Ensure window is the actual window object (not a string overwritten by previous tests)
        if (typeof window !== "object" || window === null) {
            (globalThis as typeof globalThis & { window?: typeof globalThis; }).window = globalThis;
        }
        // Mock dispatchEvent to call listeners directly
        const originalDispatchEvent = window.dispatchEvent?.bind(window);
        window.dispatchEvent = ((event: Event) => {
            if (event.type === "clipboard-read-error") {
                listener();
            }
            return true;
        }) as (event: Event) => boolean;
        Object.defineProperty(navigator, "clipboard", {
            value: { readText: () => Promise.reject({ name: "UnknownError" }) },
            configurable: true,
        });
        await KeyEventHandler.handlePaste(event);
        expect(listener).toHaveBeenCalled();
        expect(mockInsertText).not.toHaveBeenCalled();
        // Restore dispatchEvent
        window.dispatchEvent = originalDispatchEvent;
    });

    it("falls back to global lastCopiedText when clipboard empty", async () => {
        const event = createEvent("");
        (globalThis as unknown as { lastCopiedText?: unknown; }).lastCopiedText = "fallback";
        Object.defineProperty(navigator, "clipboard", {
            value: { readText: () => Promise.resolve("") },
            configurable: true,
        });
        await KeyEventHandler.handlePaste(event);
        expect(mockInsertText).toHaveBeenCalledWith("fallback");
    });

    it("dispatches read error when cursor insertion throws", async () => {
        const event = createEvent("oops");
        mockInsertText.mockImplementationOnce(() => {
            throw new Error("boom");
        });
        const listener = vi.fn();
        // Mock dispatchEvent to call listeners directly
        const originalDispatchEvent = window.dispatchEvent?.bind(window);
        window.dispatchEvent = ((event: Event) => {
            if (event.type === "clipboard-read-error") {
                listener();
            }
            return true;
        }) as (event: Event) => boolean;
        await KeyEventHandler.handlePaste(event);
        expect(listener).toHaveBeenCalled();
        // Restore dispatchEvent
        window.dispatchEvent = originalDispatchEvent || (vi.fn() as (event: Event) => boolean);
    });
});
