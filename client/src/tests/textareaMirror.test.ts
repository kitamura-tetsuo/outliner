import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";

describe("textareaMirror", () => {
    let textarea: HTMLTextAreaElement;

    beforeEach(() => {
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
        document.body.innerHTML = "";
    });

    it("mirrors cross-item selection", () => {
        editorOverlayStore.syncTextareaToSelection("item1", 0, "item2", 6);

        expect(textarea.value).toBe("Line 1\nLine 2");
        expect(textarea.selectionStart).toBe(0);
        expect(textarea.selectionEnd).toBe(13);
    });
});
