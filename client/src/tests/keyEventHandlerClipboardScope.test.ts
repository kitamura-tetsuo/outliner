import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock of the editor store: it always reports a selection, which is exactly the
// stale state that used to make Ctrl+C copy item content while the focus was
// somewhere else on the page.
const { mockStore } = vi.hoisted(() => {
    const store = {
        selections: {
            // As the store stores it (#5025): endpoints, plus the flat text mirrors.
            local: {
                start: { kind: "text", itemId: "item-1", offset: 0 },
                end: { kind: "text", itemId: "item-1", offset: 4 },
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

import { FOREIGN_EDITOR_ATTRIBUTE } from "../lib/foreignEditor";
import { isEditorClipboardEvent, isForeignInput, KeyEventHandler } from "../lib/KeyEventHandler";

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

// Monaco renders its own DOM: the node under the caret is a `.view-line` div and
// the focus holder may be a hidden textarea or an EditContext host. Tag-name
// checks alone therefore cannot tell "inside the SQL editor" from "in the
// outline", which is what the `data-foreign-editor` marker is for.
describe("embedded editor ownership", () => {
    let sqlEditorRoot: HTMLElement;
    let viewLine: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = "";
        sqlEditorRoot = document.createElement("div");
        sqlEditorRoot.setAttribute(FOREIGN_EDITOR_ATTRIBUTE, "sql");
        viewLine = document.createElement("div");
        viewLine.className = "view-line";
        sqlEditorRoot.appendChild(viewLine);
        document.body.appendChild(sqlEditorRoot);
    });

    it("treats any node inside a marked editor as foreign", () => {
        expect(isForeignInput(viewLine)).toBe(true);
        expect(isForeignInput(sqlEditorRoot)).toBe(true);
    });

    it("leaves the outline outside the marked subtree alone", () => {
        const outlineNode = document.createElement("div");
        document.body.appendChild(outlineNode);
        expect(isForeignInput(outlineNode)).toBe(false);
    });

    it("does not claim the clipboard while the embedded editor has focus", () => {
        const inputArea = document.createElement("textarea");
        sqlEditorRoot.appendChild(inputArea);
        inputArea.focus();

        expect(isEditorClipboardEvent(createCopyEvent(viewLine))).toBe(false);
    });
});
