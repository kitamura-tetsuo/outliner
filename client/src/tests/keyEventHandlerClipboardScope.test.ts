import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock of the editor store: it always reports a selection, which is exactly the
// stale state that used to make Ctrl+C copy item content while the focus was
// somewhere else on the page.
const { mockStore } = vi.hoisted(() => {
    const store = {
        selections: {
            local: {
                startItemId: "item-1",
                startOffset: 0,
                endItemId: "item-1",
                endOffset: 4,
                userId: "local",
                isReversed: false,
            },
        },
        getSelectedText: vi.fn(() => "item text"),
        getLocalCursorInstances: vi.fn(() => []),
        getTextareaRef: vi.fn(),
    };
    return { mockStore: store };
});
vi.mock("../stores/EditorOverlayStore.svelte", () => ({ editorOverlayStore: mockStore }));

import { isEditorClipboardEvent, KeyEventHandler } from "../lib/KeyEventHandler";

function createCopyEvent(target: EventTarget): ClipboardEvent {
    const event = new Event("copy", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "target", { value: target });
    Object.defineProperty(event, "clipboardData", {
        value: { setData: vi.fn() },
    });
    return event;
}

describe("clipboard scope", () => {
    let globalTextarea: HTMLTextAreaElement;
    let foreignInput: HTMLInputElement;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";

        globalTextarea = document.createElement("textarea");
        globalTextarea.className = "global-textarea";
        document.body.appendChild(globalTextarea);

        foreignInput = document.createElement("input");
        document.body.appendChild(foreignInput);
    });

    it("claims the copy while the global textarea has focus", () => {
        globalTextarea.focus();
        expect(isEditorClipboardEvent(createCopyEvent(globalTextarea))).toBe(true);
    });

    it("ignores the copy while another input has focus", () => {
        foreignInput.focus();
        expect(isEditorClipboardEvent(createCopyEvent(foreignInput))).toBe(false);
    });

    it("ignores the copy while nothing in the editor has focus", () => {
        globalTextarea.blur();
        expect(isEditorClipboardEvent(createCopyEvent(document.body))).toBe(false);
    });

    it("does not copy item text when the editor is not focused", () => {
        foreignInput.focus();
        const event = createCopyEvent(foreignInput);

        KeyEventHandler.handleCopy(event);

        expect(event.defaultPrevented).toBe(false);
        expect(event.clipboardData!.setData).not.toHaveBeenCalled();
        expect(mockStore.getSelectedText).not.toHaveBeenCalled();
    });

    it("copies item text when the editor is focused", () => {
        globalTextarea.focus();
        const event = createCopyEvent(globalTextarea);

        KeyEventHandler.handleCopy(event);

        expect(event.defaultPrevented).toBe(true);
        expect(event.clipboardData!.setData).toHaveBeenCalledWith("text/plain", "item text");
    });
});
