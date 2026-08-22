import { describe, expect, it } from "vitest";
import { nodeBoundaryEndpoint, textEndpoint } from "./selectionEndpoints";
import { extendFocusAcrossVisualNode, type OutlineRow } from "./selectionKeyboard";

/** Text A / Grid / Text B: the arrangement a Shift+Arrow has to cross. */
const rows: OutlineRow[] = [
    { itemId: "a", isVisual: false, textLength: 10 },
    { itemId: "grid", isVisual: true, textLength: 0 },
    { itemId: "b", isVisual: false, textLength: 9 },
];

describe("extendFocusAcrossVisualNode", () => {
    it("declines an ordinary text-to-text move", () => {
        const textOnly: OutlineRow[] = [
            { itemId: "a", isVisual: false, textLength: 10 },
            { itemId: "b", isVisual: false, textLength: 9 },
        ];
        expect(extendFocusAcrossVisualNode(textOnly, textEndpoint("a", 4), "down")).toBeUndefined();
        expect(extendFocusAcrossVisualNode(textOnly, textEndpoint("b", 4), "up")).toBeUndefined();
    });

    it("reaches the far edge of the block below, taking it whole", () => {
        expect(extendFocusAcrossVisualNode(rows, textEndpoint("a", 4), "down"))
            .toEqual(nodeBoundaryEndpoint("grid", "after"));
    });

    it("reaches the far edge of the block above, taking it whole", () => {
        expect(extendFocusAcrossVisualNode(rows, textEndpoint("b", 4), "up"))
            .toEqual(nodeBoundaryEndpoint("grid", "before"));
    });

    it("steps off a block onto the next row's first character", () => {
        expect(extendFocusAcrossVisualNode(rows, nodeBoundaryEndpoint("grid", "after"), "down"))
            .toEqual(textEndpoint("b", 0));
    });

    it("steps off a block onto the previous row's last character", () => {
        expect(extendFocusAcrossVisualNode(rows, nodeBoundaryEndpoint("grid", "before"), "up"))
            .toEqual(textEndpoint("a", 10));
    });

    it("crosses a block's own width in one press, in either direction", () => {
        expect(extendFocusAcrossVisualNode(rows, nodeBoundaryEndpoint("grid", "before"), "down"))
            .toEqual(nodeBoundaryEndpoint("grid", "after"));
        expect(extendFocusAcrossVisualNode(rows, nodeBoundaryEndpoint("grid", "after"), "up"))
            .toEqual(nodeBoundaryEndpoint("grid", "before"));
    });

    it("takes the next block whole when two blocks are adjacent", () => {
        const adjacent: OutlineRow[] = [
            { itemId: "grid", isVisual: true, textLength: 0 },
            { itemId: "calendar", isVisual: true, textLength: 0 },
        ];
        expect(extendFocusAcrossVisualNode(adjacent, nodeBoundaryEndpoint("grid", "after"), "down"))
            .toEqual(nodeBoundaryEndpoint("calendar", "after"));
        expect(extendFocusAcrossVisualNode(adjacent, nodeBoundaryEndpoint("calendar", "before"), "up"))
            .toEqual(nodeBoundaryEndpoint("grid", "before"));
    });

    it("stops at the ends of the outline", () => {
        expect(extendFocusAcrossVisualNode(rows, nodeBoundaryEndpoint("grid", "after"), "down"))
            .not.toBeUndefined();
        expect(extendFocusAcrossVisualNode(rows, textEndpoint("b", 4), "down")).toBeUndefined();
        expect(extendFocusAcrossVisualNode(rows, textEndpoint("a", 4), "up")).toBeUndefined();
    });

    it("declines a focus the outline no longer holds", () => {
        expect(extendFocusAcrossVisualNode(rows, textEndpoint("gone", 0), "down")).toBeUndefined();
    });
});
