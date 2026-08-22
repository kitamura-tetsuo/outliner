import { describe, expect, it } from "vitest";
import { nodeTarget, resolveDragSelection, targetOfEndpoint, textTarget } from "./selectionDrag";
import { nodeBoundaryEndpoint, textEndpoint } from "./selectionEndpoints";

/** Outline order backed by an explicit item list, so no tree or layout engine is needed. */
function orderedBy(itemIds: string[]) {
    return (a: string, b: string) => itemIds.indexOf(a) - itemIds.indexOf(b);
}

// Text A / Grid / Calendar / Text B: everything a drag can run between.
const compare = orderedBy(["a", "grid", "calendar", "b"]);

describe("resolveDragSelection", () => {
    it("keeps a text-to-text drag exactly as it was", () => {
        expect(resolveDragSelection(textTarget("a", 2), textTarget("b", 5), compare)).toEqual({
            start: textEndpoint("a", 2),
            end: textEndpoint("b", 5),
            isReversed: false,
        });
    });

    it("orders two offsets inside one item", () => {
        expect(resolveDragSelection(textTarget("a", 7), textTarget("a", 2), compare)).toEqual({
            start: textEndpoint("a", 2),
            end: textEndpoint("a", 7),
            isReversed: true,
        });
    });

    it("selects a single visual node between its own boundaries", () => {
        expect(resolveDragSelection(nodeTarget("grid"), nodeTarget("grid"), compare)).toEqual({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: nodeBoundaryEndpoint("grid", "after"),
            isReversed: false,
        });
    });

    it("takes a visual node whole when a drag ends on it", () => {
        expect(resolveDragSelection(textTarget("a", 6), nodeTarget("grid"), compare)).toEqual({
            start: textEndpoint("a", 6),
            end: nodeBoundaryEndpoint("grid", "after"),
            isReversed: false,
        });
    });

    it("takes a visual node whole when a drag starts on it", () => {
        expect(resolveDragSelection(nodeTarget("grid"), textTarget("b", 5), compare)).toEqual({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: textEndpoint("b", 5),
            isReversed: false,
        });
    });

    it("resolves a reverse drag to the same content as its forward twin", () => {
        const forward = resolveDragSelection(textTarget("a", 6), nodeTarget("grid"), compare);
        const backward = resolveDragSelection(nodeTarget("grid"), textTarget("a", 6), compare);

        expect(backward.start).toEqual(forward.start);
        expect(backward.end).toEqual(forward.end);
        // Only the direction differs, which is what tells the caret which end moved.
        expect(forward.isReversed).toBe(false);
        expect(backward.isReversed).toBe(true);
    });

    it("takes both visual nodes when a drag runs from one block to another", () => {
        expect(resolveDragSelection(nodeTarget("grid"), nodeTarget("calendar"), compare)).toEqual({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: nodeBoundaryEndpoint("calendar", "after"),
            isReversed: false,
        });

        expect(resolveDragSelection(nodeTarget("calendar"), nodeTarget("grid"), compare)).toEqual({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: nodeBoundaryEndpoint("calendar", "after"),
            isReversed: true,
        });
    });
});

describe("targetOfEndpoint", () => {
    it("keeps a text endpoint's offset", () => {
        expect(targetOfEndpoint(textEndpoint("a", 3))).toEqual(textTarget("a", 3));
    });

    it("drops the side of a node boundary, so extension re-derives it", () => {
        expect(targetOfEndpoint(nodeBoundaryEndpoint("grid", "after"))).toEqual(nodeTarget("grid"));

        // An anchor that was the *after* edge becomes the *before* edge once the other
        // end moves below it, which keeps its block inside the range.
        const extended = resolveDragSelection(
            targetOfEndpoint(nodeBoundaryEndpoint("grid", "after")),
            textTarget("b", 1),
            compare,
        );
        expect(extended.start).toEqual(nodeBoundaryEndpoint("grid", "before"));
    });
});
