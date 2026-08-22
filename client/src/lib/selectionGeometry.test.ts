import { beforeEach, describe, expect, it } from "vitest";
import {
    convertClientRectsToOverlayRects,
    createRangeForOffsets,
    findTextPositionInElement,
    mergeRectsIntoLines,
    type OverlayRect,
    type ViewportRect,
} from "./selectionGeometry";

/** Build a viewport rect from its edges, mirroring what the browser reports for a range. */
function rect(left: number, top: number, right: number, bottom: number): ViewportRect {
    return { left, top, right, bottom, width: right - left, height: bottom - top };
}

describe("convertClientRectsToOverlayRects", () => {
    const container = { left: 100, top: 50 };

    it("returns one overlay rect per visual line fragment", () => {
        const fragments = convertClientRectsToOverlayRects(
            [rect(120, 60, 300, 80), rect(110, 80, 200, 100)],
            container,
        );

        expect(fragments).toEqual([
            { left: 20, top: 10, width: 180, height: 20 },
            { left: 10, top: 30, width: 90, height: 20 },
        ]);
    });

    it("applies scroll offset and padding compensation", () => {
        const fragments = convertClientRectsToOverlayRects(
            [rect(120, 60, 300, 80)],
            container,
            { scrollTop: 15, topAdjust: 4 },
        );

        expect(fragments[0].top).toBe(60 - 50 + 15 - 4);
    });

    it("clips fragments to the rendered text box", () => {
        const fragments = convertClientRectsToOverlayRects(
            [rect(120, 60, 900, 80)],
            container,
            { clipLeft: 130, clipRight: 400 },
        );

        expect(fragments).toEqual([{ left: 30, top: 10, width: 270, height: 20 }]);
    });

    it("drops empty rects and fully clipped-out rects", () => {
        const fragments = convertClientRectsToOverlayRects(
            [rect(120, 60, 120, 80), rect(120, 60, 300, 60), rect(500, 60, 600, 80)],
            container,
            { clipRight: 400 },
        );

        expect(fragments).toEqual([]);
    });
});

describe("mergeRectsIntoLines", () => {
    it("merges adjacent inline boxes that share a visual line", () => {
        const merged = mergeRectsIntoLines([
            { left: 10, top: 0, width: 40, height: 20 },
            { left: 50, top: 0, width: 30, height: 20 },
        ]);

        expect(merged).toEqual([{ left: 10, top: 0, width: 70, height: 20 }]);
    });

    it("keeps separate visual lines apart", () => {
        const lines: OverlayRect[] = [
            { left: 10, top: 20, width: 100, height: 20 },
            { left: 0, top: 0, width: 80, height: 20 },
        ];

        expect(mergeRectsIntoLines(lines)).toEqual([
            { left: 0, top: 0, width: 80, height: 20 },
            { left: 10, top: 20, width: 100, height: 20 },
        ]);
    });

    it("keeps horizontally separated boxes on one line apart", () => {
        // Bidirectional text can put two genuinely separate selected runs on the same line
        const merged = mergeRectsIntoLines([
            { left: 0, top: 0, width: 30, height: 20 },
            { left: 90, top: 0, width: 40, height: 20 },
        ]);

        expect(merged).toEqual([
            { left: 0, top: 0, width: 30, height: 20 },
            { left: 90, top: 0, width: 40, height: 20 },
        ]);
    });

    it("still merges across a hairline seam between inline boxes", () => {
        const merged = mergeRectsIntoLines([
            { left: 0, top: 0, width: 30, height: 20 },
            { left: 30.5, top: 0, width: 20, height: 20 },
        ]);

        expect(merged).toEqual([{ left: 0, top: 0, width: 50.5, height: 20 }]);
    });

    it("merges a run that continues after a separated gap on the same line", () => {
        const merged = mergeRectsIntoLines([
            { left: 0, top: 0, width: 30, height: 20 },
            { left: 90, top: 0, width: 40, height: 20 },
            { left: 130, top: 0, width: 20, height: 20 },
        ]);

        expect(merged).toEqual([
            { left: 0, top: 0, width: 30, height: 20 },
            { left: 90, top: 0, width: 60, height: 20 },
        ]);
    });

    it("merges boxes of differing height on the same line", () => {
        const merged = mergeRectsIntoLines([
            { left: 0, top: 2, width: 30, height: 16 },
            { left: 30, top: 0, width: 20, height: 20 },
        ]);

        expect(merged).toEqual([{ left: 0, top: 0, width: 50, height: 20 }]);
    });
});

describe("findTextPositionInElement / createRangeForOffsets", () => {
    let element: HTMLElement;

    beforeEach(() => {
        element = document.createElement("span");
        // Formatted items split their text across nested inline elements
        element.innerHTML = "abc<strong>def</strong>gh";
        document.body.appendChild(element);
    });

    it("maps an offset to the text node that contains it", () => {
        const position = findTextPositionInElement(element, 4);

        expect(position?.node.textContent).toBe("def");
        expect(position?.offset).toBe(1);
    });

    it("maps a node boundary to the start of the following text node", () => {
        const position = findTextPositionInElement(element, 3);

        expect(position?.node.textContent).toBe("def");
        expect(position?.offset).toBe(0);
    });

    it("maps the very end of the text to the end of the last node", () => {
        const position = findTextPositionInElement(element, 8);

        expect(position?.node.textContent).toBe("gh");
        expect(position?.offset).toBe(2);
    });

    it("returns undefined for out-of-range offsets", () => {
        expect(findTextPositionInElement(element, -1)).toBeUndefined();
        expect(findTextPositionInElement(element, 9)).toBeUndefined();
    });

    it("builds a range spanning nested inline elements", () => {
        const range = createRangeForOffsets(element, 1, 7);

        expect(range?.toString()).toBe("bcdefg");
    });

    it("returns undefined when a boundary cannot be resolved", () => {
        expect(createRangeForOffsets(element, 1, 99)).toBeUndefined();
    });
});
