import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyEventHandler } from "./KeyEventHandler";

// Svelte store mock as permitted by AGENTS.md
const insertText = vi.fn();
const clearSelections = vi.fn();
const startCursorBlink = vi.fn();
let selections: Record<string, unknown> = {};

vi.mock("../stores/EditorOverlayStore.svelte", () => ({
    editorOverlayStore: {
        getCursorInstances: () => [{ insertText }],
        selections,
        clearSelections,
        startCursorBlink,
    },
}));

describe("KeyEventHandler.handlePaste", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        selections = {};
        (window as any).lastCopiedText = undefined;
    });

    afterEach(() => {
        delete (navigator as any).clipboard;
    });

    const createEvent = (text: string): ClipboardEvent => {
        const clipboardData = {
            getData: vi.fn((_format: string) => text),
        } as unknown as DataTransfer;
        return {
            clipboardData,
            preventDefault: vi.fn(),
        } as unknown as ClipboardEvent;
    };

    it("inserts clipboard text when available", async () => {
        const event = createEvent("hello world");
        await KeyEventHandler.handlePaste(event);
        expect(insertText).toHaveBeenCalledWith("hello world");
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
        expect(insertText).not.toHaveBeenCalled();
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
        expect(insertText).not.toHaveBeenCalled();
        window.removeEventListener("clipboard-read-error", listener);
    });

    it("falls back to global lastCopiedText when clipboard empty", async () => {
        const event = createEvent("");
        (window as any).lastCopiedText = "fallback";
        Object.defineProperty(navigator, "clipboard", {
            value: { readText: () => Promise.resolve("") },
            configurable: true,
        });
        await KeyEventHandler.handlePaste(event);
        expect(insertText).toHaveBeenCalledWith("fallback");
    });

    it("dispatches read error when cursor insertion throws", async () => {
        const event = createEvent("oops");
        insertText.mockImplementationOnce(() => {
            throw new Error("boom");
        });
        const listener = vi.fn();
        window.addEventListener("clipboard-read-error", listener);
        await KeyEventHandler.handlePaste(event);
        expect(listener).toHaveBeenCalled();
        window.removeEventListener("clipboard-read-error", listener);
    });
});
