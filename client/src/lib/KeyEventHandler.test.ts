/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyEventHandler } from "./KeyEventHandler";

const { mockInsertText } = vi.hoisted(() => ({
    mockInsertText: vi.fn(),
}));

// Svelte store mock
vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        getCursorInstances: vi.fn(() => [{
            insertText: mockInsertText,
        }]),
        cursorInstances: new Map(),
        insertText: mockInsertText,
        clearSelections: vi.fn(),
        startCursorBlink: vi.fn(),
        selections: {},
    },
}));

// Svelte store mock
vi.mock("../stores/AliasPickerStore.svelte", () => ({
    aliasPickerStore: {
        visible: false,
        show: vi.fn(),
        hide: vi.fn(),
    },
}));

describe("KeyEventHandler.handlePaste", () => {
    let event: ClipboardEvent;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        Object.defineProperty(navigator, "clipboard", {
            value: undefined,
            configurable: true,
        });
    });

    const createEvent = (text: string): ClipboardEvent => {
        const clipboardData = {
            getData: vi.fn((_format: string) => text),
        };
        return {
            clipboardData,
            preventDefault: vi.fn(),
        } as unknown as ClipboardEvent;
    };

    it("should handle simple text paste", async () => {
        event = createEvent("hello world");
        await KeyEventHandler.handlePaste(event);
        expect(mockInsertText).toHaveBeenCalledWith("hello world");
    });
});
