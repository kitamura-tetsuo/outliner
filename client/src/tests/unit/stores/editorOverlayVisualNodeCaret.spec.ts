import { beforeEach, describe, expect, it } from "vitest";
import { nodeBoundaryEndpoint, textEndpoint } from "../../../lib/selection/selectionEndpoints";
import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";

/**
 * Where the caret lives while an atomic visual node is selected (#5026).
 *
 * A Grid, Calendar or Layout holds no character position, so a caret can never be in one.
 * It keeps a home just outside instead, which is what lets Delete, Cut and Copy keep
 * reaching the outline through the ordinary editor paths - and the hidden textarea, which
 * mirrors characters, must not read a position back into the block either.
 */

/** Text A / Grid / Text B, rendered the way the outline renders it. */
const ROWS = [
    { id: "text-a", text: "Alpha text", kind: "text" },
    { id: "grid", text: "", kind: "grid" },
    { id: "text-b", text: "Omega text", kind: "text" },
];

function buildOutliner(): void {
    document.body.innerHTML = "";
    const outliner = document.createElement("div");
    outliner.className = "outliner";
    for (const row of ROWS) {
        const element = document.createElement("div");
        element.className = "outliner-item";
        element.setAttribute("data-item-id", row.id);
        element.setAttribute("data-node-kind", row.kind);
        if (row.kind === "text") {
            const text = document.createElement("span");
            text.className = "item-text";
            text.textContent = row.text;
            element.appendChild(text);
        }
        outliner.appendChild(element);
    }
    document.body.appendChild(outliner);
}

function localCursorPositions() {
    return Object.values(editorOverlayStore.cursors)
        .filter(cursor => (cursor.userId ?? "local") === "local")
        .map(cursor => ({ itemId: cursor.itemId, offset: cursor.offset }));
}

describe("EditorOverlayStore.placeCaretAtNodeBoundary", () => {
    beforeEach(() => {
        buildOutliner();
        editorOverlayStore.selections = {};
        editorOverlayStore.cursors = {};
        editorOverlayStore.setActiveItem(null);
    });

    it("reads `before` as the end of the row preceding the block", () => {
        editorOverlayStore.placeCaretAtNodeBoundary("grid", "before");

        expect(localCursorPositions()).toEqual([{ itemId: "text-a", offset: "Alpha text".length }]);
    });

    it("reads `after` as the start of the row following the block", () => {
        editorOverlayStore.placeCaretAtNodeBoundary("grid", "after");

        expect(localCursorPositions()).toEqual([{ itemId: "text-b", offset: 0 }]);
    });

    it("takes the other side when the outline has no row on the one asked for", () => {
        document.querySelector('[data-item-id="text-a"]')?.remove();

        editorOverlayStore.placeCaretAtNodeBoundary("grid", "before");

        expect(localCursorPositions()).toEqual([{ itemId: "text-b", offset: 0 }]);
    });

    it("moves a settled caret when following a drag, and keeps it when asked to", () => {
        editorOverlayStore.setCursor({ itemId: "text-a", offset: 3, isActive: true, userId: "local" });

        editorOverlayStore.placeCaretAtNodeBoundary("grid", "after", { keepSettled: true });
        expect(localCursorPositions()).toEqual([{ itemId: "text-a", offset: 3 }]);

        editorOverlayStore.placeCaretAtNodeBoundary("grid", "after");
        expect(localCursorPositions()).toEqual([{ itemId: "text-b", offset: 0 }]);
    });

    it("never places a caret when the outline holds no Text row at all", () => {
        document.querySelector('[data-item-id="text-a"]')?.remove();
        document.querySelector('[data-item-id="text-b"]')?.remove();

        editorOverlayStore.placeCaretAtNodeBoundary("grid", "before");

        expect(localCursorPositions()).toEqual([]);
    });
});

describe("EditorOverlayStore.syncSelectionFromTextarea with a block as the active row", () => {
    beforeEach(() => {
        buildOutliner();
        editorOverlayStore.selections = {};
        editorOverlayStore.cursors = {};
    });

    it("keeps a block's own selection, and puts no caret inside it", () => {
        const textarea = document.createElement("textarea");
        textarea.className = "global-textarea";
        document.body.appendChild(textarea);
        editorOverlayStore.setTextareaRef(textarea);

        editorOverlayStore.setSelection({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: nodeBoundaryEndpoint("grid", "after"),
            userId: "local",
        });
        editorOverlayStore.setActiveItem("grid");

        // The mirror holds no selection of its own - a block gave it nothing to mirror.
        editorOverlayStore.syncSelectionFromTextarea();

        const [selection] = Object.values(editorOverlayStore.selections);
        expect(selection?.start).toEqual(nodeBoundaryEndpoint("grid", "before"));
        expect(selection?.end).toEqual(nodeBoundaryEndpoint("grid", "after"));
        expect(localCursorPositions().map(cursor => cursor.itemId)).not.toContain("grid");
    });

    it("still mirrors a Text row back the way it always did", () => {
        const textarea = document.createElement("textarea");
        textarea.className = "global-textarea";
        textarea.value = "Alpha text";
        document.body.appendChild(textarea);
        editorOverlayStore.setTextareaRef(textarea);

        editorOverlayStore.setActiveItem("text-a");
        textarea.setSelectionRange(2, 6);
        editorOverlayStore.syncSelectionFromTextarea();

        const [selection] = Object.values(editorOverlayStore.selections);
        expect(selection?.start).toEqual(textEndpoint("text-a", 2));
        expect(selection?.end).toEqual(textEndpoint("text-a", 6));
    });
});
