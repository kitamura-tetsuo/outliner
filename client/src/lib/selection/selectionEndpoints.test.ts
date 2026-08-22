import { describe, expect, it } from "vitest";
import {
    compareSelectionEndpoints,
    endpointsEqual,
    endpointTextOffset,
    isCollapsedSelection,
    nodeBoundaryEndpoint,
    normalizeSelectionEndpoints,
    parseSelectionEndpoint,
    selectionCoversContent,
    textEndpoint,
    textSelectionEndpoints,
    textSelectionOffsetBounds,
} from "./selectionEndpoints";

/** Outline order backed by an explicit item list, so no tree or layout engine is needed. */
function orderedBy(itemIds: string[]) {
    return (a: string, b: string) => itemIds.indexOf(a) - itemIds.indexOf(b);
}

describe("compareSelectionEndpoints", () => {
    // Text A / Grid / Text B: the arrangement the endpoint model exists for.
    const compare = orderedBy(["a", "grid", "b"]);

    it("orders the positions around a visual node deterministically", () => {
        const positions = [
            textEndpoint("a", 6),
            nodeBoundaryEndpoint("grid", "before"),
            nodeBoundaryEndpoint("grid", "after"),
            textEndpoint("b", 0),
        ];

        for (let i = 0; i < positions.length - 1; i++) {
            expect(compareSelectionEndpoints(positions[i], positions[i + 1], compare)).toBe(-1);
            expect(compareSelectionEndpoints(positions[i + 1], positions[i], compare)).toBe(1);
        }
    });

    it("orders the two boundaries of adjacent visual nodes", () => {
        const adjacent = orderedBy(["grid", "calendar"]);
        const order = [
            nodeBoundaryEndpoint("grid", "before"),
            nodeBoundaryEndpoint("grid", "after"),
            nodeBoundaryEndpoint("calendar", "before"),
            nodeBoundaryEndpoint("calendar", "after"),
        ];

        for (let i = 0; i < order.length - 1; i++) {
            expect(compareSelectionEndpoints(order[i], order[i + 1], adjacent)).toBe(-1);
        }
    });

    it("treats each boundary as equal to itself", () => {
        const before = nodeBoundaryEndpoint("grid", "before");
        expect(compareSelectionEndpoints(before, nodeBoundaryEndpoint("grid", "before"), compare)).toBe(0);
        expect(compareSelectionEndpoints(before, before, compare)).toBe(0);
    });

    it("orders text offsets inside one item", () => {
        expect(compareSelectionEndpoints(textEndpoint("a", 2), textEndpoint("a", 9), compare)).toBe(-1);
        expect(compareSelectionEndpoints(textEndpoint("a", 9), textEndpoint("a", 2), compare)).toBe(1);
        expect(compareSelectionEndpoints(textEndpoint("a", 4), textEndpoint("a", 4), compare)).toBe(0);
    });

    it("leaves endpoints the comparator cannot place in the caller's order", () => {
        const unknown = orderedBy([]);
        expect(compareSelectionEndpoints(textEndpoint("x", 3), textEndpoint("y", 1), unknown)).toBe(0);
    });
});

describe("normalizeSelectionEndpoints", () => {
    const compare = orderedBy(["a", "grid", "calendar", "b"]);

    it("keeps a forward text selection as-is", () => {
        const normalized = normalizeSelectionEndpoints(textEndpoint("a", 3), textEndpoint("b", 5), compare);

        expect(normalized).toEqual({
            first: textEndpoint("a", 3),
            last: textEndpoint("b", 5),
            isVisuallyReversed: false,
        });
    });

    it("swaps endpoints stored in reverse document order", () => {
        const normalized = normalizeSelectionEndpoints(textEndpoint("b", 5), textEndpoint("a", 3), compare);

        expect(normalized).toEqual({
            first: textEndpoint("a", 3),
            last: textEndpoint("b", 5),
            isVisuallyReversed: true,
        });
    });

    it("orders offsets within a single item", () => {
        const normalized = normalizeSelectionEndpoints(textEndpoint("a", 9), textEndpoint("a", 2), compare);

        expect(normalized).toEqual({
            first: textEndpoint("a", 2),
            last: textEndpoint("a", 9),
            isVisuallyReversed: true,
        });
    });

    it("normalizes a selection that ends at a visual node's boundary", () => {
        const normalized = normalizeSelectionEndpoints(
            textEndpoint("a", 2),
            nodeBoundaryEndpoint("grid", "after"),
            compare,
        );

        expect(normalized.first).toEqual(textEndpoint("a", 2));
        expect(normalized.last).toEqual(nodeBoundaryEndpoint("grid", "after"));
        expect(normalized.isVisuallyReversed).toBe(false);
    });

    it("normalizes a selection that starts at a visual node's boundary", () => {
        const normalized = normalizeSelectionEndpoints(
            nodeBoundaryEndpoint("grid", "before"),
            textEndpoint("b", 4),
            compare,
        );

        expect(normalized.first).toEqual(nodeBoundaryEndpoint("grid", "before"));
        expect(normalized.last).toEqual(textEndpoint("b", 4));
    });

    it("resolves a reversed mixed selection to the same range as the forward one", () => {
        const forward = normalizeSelectionEndpoints(
            textEndpoint("a", 4),
            nodeBoundaryEndpoint("calendar", "after"),
            compare,
        );
        const reverse = normalizeSelectionEndpoints(
            nodeBoundaryEndpoint("calendar", "after"),
            textEndpoint("a", 4),
            compare,
        );

        expect(reverse.first).toEqual(forward.first);
        expect(reverse.last).toEqual(forward.last);
        // The direction is preserved separately from the content.
        expect(forward.isVisuallyReversed).toBe(false);
        expect(reverse.isVisuallyReversed).toBe(true);
    });

    it("orders both boundaries of one visual node", () => {
        const normalized = normalizeSelectionEndpoints(
            nodeBoundaryEndpoint("grid", "after"),
            nodeBoundaryEndpoint("grid", "before"),
            compare,
        );

        expect(normalized.first).toEqual(nodeBoundaryEndpoint("grid", "before"));
        expect(normalized.last).toEqual(nodeBoundaryEndpoint("grid", "after"));
        expect(normalized.isVisuallyReversed).toBe(true);
    });
});

describe("endpoint predicates", () => {
    it("reports a text offset only for a text endpoint", () => {
        expect(endpointTextOffset(textEndpoint("a", 7))).toBe(7);
        expect(endpointTextOffset(nodeBoundaryEndpoint("grid", "before"))).toBeUndefined();
        expect(endpointTextOffset(undefined)).toBeUndefined();
    });

    it("compares endpoints by kind as well as position", () => {
        expect(endpointsEqual(textEndpoint("a", 2), textEndpoint("a", 2))).toBe(true);
        expect(endpointsEqual(textEndpoint("a", 2), textEndpoint("a", 3))).toBe(false);
        expect(endpointsEqual(nodeBoundaryEndpoint("g", "before"), nodeBoundaryEndpoint("g", "before"))).toBe(true);
        expect(endpointsEqual(nodeBoundaryEndpoint("g", "before"), nodeBoundaryEndpoint("g", "after"))).toBe(false);
        expect(endpointsEqual(textEndpoint("g", 0), nodeBoundaryEndpoint("g", "before"))).toBe(false);
    });

    it("sees a whole Grid between its own boundaries as covered content", () => {
        expect(selectionCoversContent({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: nodeBoundaryEndpoint("grid", "after"),
        })).toBe(true);
        expect(selectionCoversContent({
            start: textEndpoint("a", 4),
            end: textEndpoint("a", 4),
        })).toBe(false);
    });

    it("reports a collapsed selection", () => {
        const compare = orderedBy(["a", "grid"]);
        expect(isCollapsedSelection(textEndpoint("a", 4), textEndpoint("a", 4), compare)).toBe(true);
        expect(
            isCollapsedSelection(
                nodeBoundaryEndpoint("grid", "before"),
                nodeBoundaryEndpoint("grid", "after"),
                compare,
            ),
        ).toBe(false);
    });

    it("hands text offsets only to a range that has two of them", () => {
        expect(textSelectionEndpoints({ start: textEndpoint("a", 2), end: textEndpoint("b", 5) })).toEqual({
            startItemId: "a",
            startOffset: 2,
            endItemId: "b",
            endOffset: 5,
        });
        expect(textSelectionEndpoints({
            start: textEndpoint("a", 2),
            end: nodeBoundaryEndpoint("grid", "after"),
        })).toBeUndefined();
    });

    it("orders the two offsets of a text range and refuses a mixed one", () => {
        expect(textSelectionOffsetBounds({ start: textEndpoint("a", 9), end: textEndpoint("a", 2) }))
            .toEqual({ low: 2, high: 9 });
        expect(textSelectionOffsetBounds({
            start: nodeBoundaryEndpoint("grid", "before"),
            end: textEndpoint("a", 2),
        })).toBeUndefined();
    });
});

describe("parseSelectionEndpoint", () => {
    it("reads an endpoint published by this build", () => {
        expect(parseSelectionEndpoint({ kind: "text", itemId: "a", offset: 4 })).toEqual(textEndpoint("a", 4));
        expect(parseSelectionEndpoint({ kind: "node-boundary", itemId: "grid", side: "after" }))
            .toEqual(nodeBoundaryEndpoint("grid", "after"));
    });

    it("reads a peer that predates the endpoint model", () => {
        expect(parseSelectionEndpoint({ itemId: "a", offset: 0 })).toEqual(textEndpoint("a", 0));
    });

    it("drops stale or malformed payloads instead of guessing a position", () => {
        expect(parseSelectionEndpoint(undefined)).toBeUndefined();
        expect(parseSelectionEndpoint(null)).toBeUndefined();
        expect(parseSelectionEndpoint("a:4")).toBeUndefined();
        expect(parseSelectionEndpoint({})).toBeUndefined();
        expect(parseSelectionEndpoint({ itemId: "", offset: 3 })).toBeUndefined();
        expect(parseSelectionEndpoint({ itemId: "a" })).toBeUndefined();
        expect(parseSelectionEndpoint({ itemId: "a", offset: "4" })).toBeUndefined();
        expect(parseSelectionEndpoint({ itemId: "a", offset: Number.NaN })).toBeUndefined();
        expect(parseSelectionEndpoint({ itemId: "a", offset: -1 })).toBeUndefined();
        expect(parseSelectionEndpoint({ kind: "node-boundary", itemId: "grid" })).toBeUndefined();
        expect(parseSelectionEndpoint({ kind: "node-boundary", itemId: "grid", side: "middle" })).toBeUndefined();
        expect(parseSelectionEndpoint({ kind: "block", itemId: "grid" })).toBeUndefined();
    });
});
