import { beforeEach, describe, expect, it } from "vitest";
import { nodeBoundaryEndpoint, textEndpoint } from "../../../lib/selection/selectionEndpoints";
import { editorOverlayStore as store } from "../../../stores/EditorOverlayStore.svelte";

let textarea: HTMLTextAreaElement;

beforeEach(() => {
    store.reset();
    document.body.innerHTML = `<div class="outliner">
        <div data-item-id="alpha" data-node-kind="text"><span class="item-text">Alpha text</span></div>
        <div data-item-id="visual" data-node-kind="grid"></div>
        <div data-item-id="omega" data-node-kind="text"><span class="item-text">Omega text</span></div>
    </div><textarea class="global-textarea"></textarea>`;
    textarea = document.querySelector("textarea")!;
    store.setTextareaRef(textarea);
    store.setActiveItem("omega");
    store.setCursor({ itemId: "omega", offset: 0, isActive: true, userId: "local" });
});

function textRange() {
    store.setSelection({ start: textEndpoint("alpha", 0), end: textEndpoint("omega", 0), userId: "local" });
}

function visualRange() {
    textRange();
    expect(textarea.value).toContain("\n");
    // The same replacement boundary used by Shift+Up: clear the character mirror,
    // then accept a range whose visual endpoint cannot be represented in it.
    store.clearSelectionForUser("local");
    store.setSelection({
        start: textEndpoint("alpha", 0),
        end: nodeBoundaryEndpoint("visual", "before"),
        userId: "local",
    });
    expect(textarea.value).toBe("");
}

describe("visual endpoint selection owns its range independently of the character mirror", () => {
    it("ignores repeated empty-mirror readback while the active caret stays on Text", () => {
        visualRange();
        const accepted = Object.values(store.selections)[0];
        for (let attempt = 0; attempt < 3; attempt++) store.syncSelectionFromTextarea();
        expect(Object.values(store.selections)).toEqual([accepted]);
        expect(store.getActiveItem()).toBe("omega");
        expect(Object.values(store.cursors).map(c => [c.itemId, c.offset])).toEqual([["omega", 0]]);
    });

    it("does not interpret a stale noncollapsed character mirror as visual-node offsets", () => {
        visualRange();
        const accepted = Object.values(store.selections)[0];
        textarea.value = "Omega text";
        textarea.setSelectionRange(2, 4);
        store.syncSelectionFromTextarea();
        expect(Object.values(store.selections)).toEqual([accepted]);
    });

    it("releases protection when a deliberate caret placement ends the visual range", () => {
        visualRange();
        store.placeLocalCaret({ itemId: "omega", offset: 2 });
        store.syncTextareaToActiveItem();
        store.syncSelectionFromTextarea();
        expect(Object.values(store.selections)).toHaveLength(0);
        expect(Object.values(store.cursors).map(c => [c.itemId, c.offset])).toEqual([["omega", 2]]);
        expect(textarea.value).toBe("Omega text");
        textarea.setSelectionRange(2, 4);
        store.syncSelectionFromTextarea();
        const [selection] = Object.values(store.selections);
        expect(selection.start).toEqual(textEndpoint("omega", 2));
        expect(selection.end).toEqual(textEndpoint("omega", 4));
        textarea.setSelectionRange(3, 3);
        store.syncSelectionFromTextarea();
        expect(Object.values(store.selections)).toHaveLength(0);
        expect(textarea.value).toBe("Omega text");
        expect(Object.values(store.cursors).map(c => [c.itemId, c.offset])).toEqual([["omega", 3]]);
    });

    it("continues mapping genuine text-only cross-item selection and collapse", () => {
        document.querySelector('[data-item-id="visual"]')!.remove();
        textRange();
        textarea.setSelectionRange(13, 15);
        store.syncSelectionFromTextarea();
        const [selection] = Object.values(store.selections);
        expect(selection.start).toEqual(textEndpoint("omega", 2));
        expect(selection.end).toEqual(textEndpoint("omega", 4));
        store.clearSelectionForUser("local");
        textRange();
        textarea.setSelectionRange(14, 14);
        store.syncSelectionFromTextarea();
        expect(Object.values(store.selections)).toHaveLength(0);
        expect(Object.values(store.cursors).map(c => [c.itemId, c.offset])).toEqual([["omega", 3]]);
    });
});
