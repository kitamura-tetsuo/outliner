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

    it("rewrites a stale cross-item mirror down to the active item when the selection is cleared", () => {
        editorOverlayStore.setTextareaRef(textarea);
        editorOverlayStore.setActiveItem("item2");
        editorOverlayStore.setCursor({ itemId: "item2", offset: 2, isActive: true, userId: "local" });
        editorOverlayStore.syncTextareaToSelection("item1", 0, "item2", 6);
        expect(textarea.value).toBe("Line 1\nLine 2");

        editorOverlayStore.clearSelectionForUser("local");

        expect(textarea.value).toBe("Line 2");
        expect(textarea.selectionStart).toBe(2);
        expect(textarea.selectionEnd).toBe(2);
    });

    // A cross-item mirror numbers offsets across every item it spans, so an OS collapse can
    // record an offset past the end of the active item. Store and mirror must not disagree.
    it("rebases a cursor left past the end of the active item by a cross-item collapse", () => {
        editorOverlayStore.setTextareaRef(textarea);
        editorOverlayStore.setActiveItem("item2");
        editorOverlayStore.syncTextareaToSelection("item1", 0, "item2", 6);
        // Offset 13 is the end of "Line 1\nLine 2", i.e. what the OS reports for the combined mirror.
        editorOverlayStore.setCursor({ itemId: "item2", offset: 13, isActive: true, userId: "local" });

        editorOverlayStore.clearSelectionForUser("local");

        expect(textarea.value).toBe("Line 2");
        expect(textarea.selectionStart).toBe(6);
        const cursor = Object.values(editorOverlayStore.cursors).find(c => (c.userId ?? "local") === "local");
        expect(cursor?.offset).toBe(6);
        expect(editorOverlayStore.cursorInstances.get(cursor!.cursorId)?.offset).toBe(6);
    });

    it("empties the mirror only when no item is being edited", () => {
        editorOverlayStore.setTextareaRef(textarea);
        editorOverlayStore.setActiveItem(null);
        textarea.value = "Line 1";

        editorOverlayStore.clearSelectionForUser("local");

        expect(textarea.value).toBe("");
    });
});
