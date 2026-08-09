import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";

describe("textareaMirror", () => {
    let textarea: HTMLTextAreaElement;

    beforeEach(() => {
        // The store is a module-level singleton, so drop any state a previous test left behind.
        editorOverlayStore.reset();
        editorOverlayStore.cursorInstances.clear();
        editorOverlayStore.setTextareaRef(null);

        textarea = document.createElement("textarea");
        textarea.className = "global-textarea";
        document.body.appendChild(textarea);

        // Mock DOM elements
        const root = document.createElement("div");
        root.className = "outliner";
        document.body.appendChild(root);

        const item1 = document.createElement("div");
        item1.setAttribute("data-item-id", "item1");
        const text1 = document.createElement("div");
        text1.className = "item-text";
        text1.textContent = "Line 1";
        item1.appendChild(text1);
        root.appendChild(item1);

        const item2 = document.createElement("div");
        item2.setAttribute("data-item-id", "item2");
        const text2 = document.createElement("div");
        text2.className = "item-text";
        text2.textContent = "Line 2";
        item2.appendChild(text2);
        root.appendChild(item2);
    });

    afterEach(() => {
        editorOverlayStore.reset();
        editorOverlayStore.cursorInstances.clear();
        editorOverlayStore.setTextareaRef(null);
        document.body.innerHTML = "";
    });

    it("mirrors cross-item selection", () => {
        editorOverlayStore.syncTextareaToSelection("item1", 0, "item2", 6);

        expect(textarea.value).toBe("Line 1\nLine 2");
        expect(textarea.selectionStart).toBe(0);
        expect(textarea.selectionEnd).toBe(13);
    });

    // Clearing the selection must not blank the mirror: the software keyboard is attached to
    // this textarea, and an empty one makes Gboard gray out its cursor-control panel.
    it("keeps the active item's text mirrored when the local selection is cleared", () => {
        editorOverlayStore.setTextareaRef(textarea);
        editorOverlayStore.setActiveItem("item1");
        editorOverlayStore.setCursor({ itemId: "item1", offset: 6, isActive: true, userId: "local" });
        editorOverlayStore.setSelection({
            startItemId: "item1",
            startOffset: 0,
            endItemId: "item1",
            endOffset: 6,
            userId: "local",
        });
        expect(textarea.value).toBe("Line 1");

        editorOverlayStore.clearSelectionForUser("local");

        expect(textarea.value).toBe("Line 1");
        expect(textarea.selectionStart).toBe(6);
        expect(textarea.selectionEnd).toBe(6);
    });

    // A cross-item mirror numbers its offsets across every item it spans, so it cannot be kept
    // once the selection is gone. Items never contain newlines, which is how it is recognised.
    it("empties a stale cross-item mirror when the selection is cleared", () => {
        editorOverlayStore.setTextareaRef(textarea);
        editorOverlayStore.setActiveItem("item2");
        editorOverlayStore.setCursor({ itemId: "item2", offset: 2, isActive: true, userId: "local" });
        editorOverlayStore.syncTextareaToSelection("item1", 0, "item2", 6);
        expect(textarea.value).toBe("Line 1\nLine 2");

        editorOverlayStore.clearSelectionForUser("local");

        expect(textarea.value).toBe("");
    });

    // The mirror must never be rewritten from a text read here: right after a delete or a
    // remote edit that read can still return the pre-edit text, and a stale mirror corrupts
    // every offset derived from it afterwards (item splits, IME edits).
    it("never rewrites the mirror's text when the selection is cleared", () => {
        editorOverlayStore.setTextareaRef(textarea);
        editorOverlayStore.setActiveItem("item1");
        editorOverlayStore.setCursor({ itemId: "item1", offset: 3, isActive: true, userId: "local" });
        // The mirror holds what the user is editing; the DOM has not caught up yet.
        textarea.value = "Line 1 edited";

        editorOverlayStore.clearSelectionForUser("local");

        expect(textarea.value).toBe("Line 1 edited");
        expect(textarea.selectionStart).toBe(3);
    });

    it("empties the mirror only when no item is being edited", () => {
        editorOverlayStore.setTextareaRef(textarea);
        editorOverlayStore.setActiveItem(null);
        textarea.value = "Line 1";

        editorOverlayStore.clearSelectionForUser("local");

        expect(textarea.value).toBe("");
    });
});
