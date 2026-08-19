import { beforeEach, describe, expect, it } from "vitest";
import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";

/**
 * The hidden global textarea mirrors the current selection so the IME and the keyboard
 * handlers have something to work against. For a selection spanning several items the mirror
 * holds their texts joined by newlines, so its offsets address that combined text — reading
 * them back as offsets of the active item collapsed the whole selection onto a single item.
 */
const ITEMS = [
    { id: "item-1", text: "First item of the reverse drag scenario" },
    { id: "item-2", text: "Second item stays fully selected" },
    { id: "item-3", text: "Third item of the reverse drag scenario" },
];

function buildOutliner(): HTMLTextAreaElement {
    document.body.innerHTML = "";

    const outliner = document.createElement("div");
    outliner.className = "outliner";
    for (const item of ITEMS) {
        const row = document.createElement("div");
        row.setAttribute("data-item-id", item.id);
        const text = document.createElement("span");
        text.className = "item-text";
        text.textContent = item.text;
        row.appendChild(text);
        outliner.appendChild(row);
    }
    document.body.appendChild(outliner);

    const textarea = document.createElement("textarea");
    textarea.className = "global-textarea";
    document.body.appendChild(textarea);
    editorOverlayStore.setTextareaRef(textarea);
    return textarea;
}

/** Select from the middle of the first item to the middle of the last one, as a drag would. */
function selectAcrossItems(isReversed: boolean) {
    editorOverlayStore.setSelection({
        startItemId: ITEMS[0].id,
        startOffset: 6,
        endItemId: ITEMS[2].id,
        endOffset: 10,
        userId: "local",
        isReversed,
    });
}

describe("EditorOverlayStore.syncSelectionFromTextarea with a cross-item mirror", () => {
    let textarea: HTMLTextAreaElement;

    beforeEach(() => {
        editorOverlayStore.reset();
        textarea = buildOutliner();
    });

    it("mirrors the whole selection into the textarea", () => {
        editorOverlayStore.setActiveItem(ITEMS[2].id);
        selectAcrossItems(false);

        expect(textarea.value).toBe(ITEMS.map(item => item.text).join("\n"));
        expect(textarea.selectionStart).toBe(6);
        expect(textarea.selectionEnd).toBe(ITEMS[0].text.length + 1 + ITEMS[1].text.length + 1 + 10);
    });

    it("keeps the selection when a stray selectionchange replays the mirrored range", () => {
        editorOverlayStore.setActiveItem(ITEMS[2].id);
        selectAcrossItems(false);

        editorOverlayStore.syncSelectionFromTextarea();

        const selection = Object.values(editorOverlayStore.selections)[0];
        expect(selection.startItemId).toBe(ITEMS[0].id);
        expect(selection.startOffset).toBe(6);
        expect(selection.endItemId).toBe(ITEMS[2].id);
        expect(selection.endOffset).toBe(10);
    });

    it("keeps the drag direction of a reverse selection", () => {
        editorOverlayStore.setActiveItem(ITEMS[0].id);
        selectAcrossItems(true);

        editorOverlayStore.syncSelectionFromTextarea();

        expect(Object.values(editorOverlayStore.selections)[0].isReversed).toBe(true);
    });

    it("drops the selection and places the caret on the right item when the mirror collapses", () => {
        editorOverlayStore.setActiveItem(ITEMS[2].id);
        selectAcrossItems(false);

        // The software keyboard collapsing the selection is the one change worth reading back:
        // the offset belongs to the second item, not to the active one.
        const collapsedAt = ITEMS[0].text.length + 1 + 7;
        textarea.setSelectionRange(collapsedAt, collapsedAt);
        editorOverlayStore.syncSelectionFromTextarea();

        expect(Object.values(editorOverlayStore.selections)).toHaveLength(0);
        expect(editorOverlayStore.getActiveItem()).toBe(ITEMS[1].id);
        const cursor = Object.values(editorOverlayStore.cursors)[0];
        expect(cursor.itemId).toBe(ITEMS[1].id);
        expect(cursor.offset).toBe(7);
    });
});
