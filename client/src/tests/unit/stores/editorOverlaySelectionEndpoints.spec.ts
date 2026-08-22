import { beforeEach, describe, expect, it } from "vitest";
import { nodeBoundaryEndpoint, textEndpoint } from "../../../lib/selection/selectionEndpoints";
import { editorOverlayStore, toSelectionRange } from "../../../stores/EditorOverlayStore.svelte";

/**
 * The store's one door for selections (#5025).
 *
 * A caller states either endpoints or the flat text form; what gets stored is endpoints,
 * with the flat fields kept as mirrors for the text-only consumers. A visual node endpoint
 * therefore has no offset at all rather than a fabricated zero.
 */

/** Text A / Grid / Text B, rendered the way the outline renders it. */
const ITEMS = [
    { id: "text-a", text: "Alpha text", visual: false },
    { id: "grid", text: "", visual: true },
    { id: "text-b", text: "Omega text", visual: false },
];

function buildOutliner(): void {
    document.body.innerHTML = "";
    const outliner = document.createElement("div");
    outliner.className = "outliner";
    for (const item of ITEMS) {
        const row = document.createElement("div");
        row.setAttribute("data-item-id", item.id);
        if (!item.visual) {
            const text = document.createElement("span");
            text.className = "item-text";
            text.textContent = item.text;
            row.appendChild(text);
        }
        outliner.appendChild(row);
    }
    document.body.appendChild(outliner);
}

describe("EditorOverlayStore selection endpoints", () => {
    beforeEach(() => {
        buildOutliner();
        editorOverlayStore.clearSelectionForUser("local");
        editorOverlayStore.selections = {};
    });

    it("turns a flat text range into endpoints and keeps the mirrors", () => {
        const range = toSelectionRange({
            startItemId: "text-a",
            startOffset: 6,
            endItemId: "text-b",
            endOffset: 5,
            userId: "local",
        });

        expect(range?.start).toEqual(textEndpoint("text-a", 6));
        expect(range?.end).toEqual(textEndpoint("text-b", 5));
        expect(range?.startOffset).toBe(6);
        expect(range?.endOffset).toBe(5);
    });

    it("stores a node-boundary range without inventing offsets", () => {
        const range = toSelectionRange({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: nodeBoundaryEndpoint("grid", "after"),
            userId: "local",
        });

        expect(range?.start).toEqual(nodeBoundaryEndpoint("grid", "before"));
        expect(range?.startItemId).toBe("grid");
        expect(range?.startOffset).toBeUndefined();
        expect(range?.endOffset).toBeUndefined();
    });

    it("drops an input that describes no position", () => {
        expect(toSelectionRange({ startItemId: "text-a", endItemId: "text-b", userId: "local" })).toBeUndefined();
        expect(toSelectionRange({ start: textEndpoint("text-a", 1), userId: "local" })).toBeUndefined();

        expect(editorOverlayStore.setSelection({ startItemId: "text-a", userId: "local" })).toBeUndefined();
        expect(Object.keys(editorOverlayStore.selections)).toHaveLength(0);
    });

    it("normalizes a mixed range to document order, keeping the direction aside", () => {
        const key = editorOverlayStore.setSelection({
            start: nodeBoundaryEndpoint("grid", "after"),
            end: textEndpoint("text-a", 6),
            userId: "local",
        });
        const selection = editorOverlayStore.selections[key!];

        const normalized = editorOverlayStore.normalizeSelection(selection);
        expect(normalized.first).toEqual(textEndpoint("text-a", 6));
        expect(normalized.last).toEqual(nodeBoundaryEndpoint("grid", "after"));
        expect(normalized.isVisuallyReversed).toBe(true);
    });

    it("reports no selected text for a range covering only a textless block", () => {
        editorOverlayStore.setSelection({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: nodeBoundaryEndpoint("grid", "after"),
            userId: "local",
        });

        expect(editorOverlayStore.getSelectedText("local")).toBe("");
    });

    it("skips a textless block when extracting the plain text of a range that spans it", () => {
        editorOverlayStore.setSelection({
            startItemId: "text-a",
            startOffset: 6,
            endItemId: "text-b",
            endOffset: 5,
            userId: "local",
        });

        expect(editorOverlayStore.getSelectedText("local")).toBe("text\nOmega");
    });
});
