import { beforeEach, describe, expect, it, vi } from "vitest";

const cursor = {
    altPageUp: vi.fn(),
    altPageDown: vi.fn(),
    formatBold: vi.fn(),
    formatItalic: vi.fn(),
    formatUnderline: vi.fn(),
    formatStrikethrough: vi.fn(),
    formatCode: vi.fn(),
    onKeyDown: vi.fn(),
    isActive: true,
    itemId: "1",
    offset: 0,
    userId: "local",
};

vi.mock("../stores/EditorOverlayStore.svelte", () => {
    return {
        editorOverlayStore: {
            getCursorInstances: vi.fn(() => [cursor]),
            addCursorRelativeToActive: vi.fn(),
            undoLastCursor: vi.fn(),
            clearSelections: vi.fn(),
            setCursor: vi.fn(),
            setBoxSelection: vi.fn(),
            getTextareaRef: vi.fn(),
            logCursorState: vi.fn(),
        },
    };
});

import { KeyEventHandler } from "../lib/KeyEventHandler";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";

describe("KeyEventHandler key map", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("adds cursor below with Ctrl+Shift+Alt+ArrowDown", () => {
        const event = new KeyboardEvent("keydown", { key: "ArrowDown", ctrlKey: true, shiftKey: true, altKey: true });
        KeyEventHandler.handleKeyDown(event);
        expect(store.addCursorRelativeToActive).toHaveBeenCalledWith("down");
    });

    it("undoes last cursor with Ctrl+Shift+Z", () => {
        const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true });
        KeyEventHandler.handleKeyDown(event);
        expect(store.undoLastCursor).toHaveBeenCalled();
    });

    it("calls box selection for Alt+Shift+ArrowRight", () => {
        const spy = vi.spyOn(KeyEventHandler, "handleBoxSelection");
        const event = new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, shiftKey: true });
        KeyEventHandler.handleKeyDown(event);
        expect(spy).toHaveBeenCalled();
    });

    it("formats bold with Ctrl+B", () => {
        const cursors = store.getCursorInstances();
        const event = new KeyboardEvent("keydown", { key: "b", ctrlKey: true });
        KeyEventHandler.handleKeyDown(event);
        expect(cursors[0].formatBold).toHaveBeenCalled();
    });
});
