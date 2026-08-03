import { beforeEach, describe, expect, it } from "vitest";
import { EditorOverlayStore } from "../stores/EditorOverlayStore.svelte";

describe("textarea mirror logic", () => {
    let store: EditorOverlayStore;

    beforeEach(() => {
        store = new EditorOverlayStore();
    });

    it("should sync textarea text and selection", () => {
        document.body.innerHTML = `
            <div class="outliner">
                <div data-item-id="1"><div class="item-text">A</div></div>
                <div data-item-id="2"><div class="item-text">B</div></div>
            </div>
            <textarea class="global-textarea"></textarea>
        `;

        store.selections = {
            "some-uuid": {
                startItemId: "1",
                startOffset: 0,
                endItemId: "2",
                endOffset: 1,
                userId: "local",
                isBoxSelection: false,
            },
        };

        store.syncTextareaToSelection();

        const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
        expect(textarea.value).toBe("A\nB");
        expect(textarea.selectionStart).toBe(0);
        expect(textarea.selectionEnd).toBe(3);
    });
});
