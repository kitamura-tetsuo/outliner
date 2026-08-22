import { describe, expect, it } from "vitest";
import { derivePasteLineLayout, detachedPasteTailDepth, spliceMultiLinePaste } from "./multiLinePaste";

describe("derivePasteLineLayout", () => {
    it("reads two spaces per level and strips the indentation", () => {
        expect(derivePasteLineLayout([
            "How it works:",
            "  Two tables",
            "  Two schedule rules",
            "Open the Schedule tab",
        ])).toEqual({
            texts: ["How it works:", "Two tables", "Two schedule rules", "Open the Schedule tab"],
            depths: [0, 1, 1, 0],
        });
    });

    it("counts a tab as one level", () => {
        expect(derivePasteLineLayout(["Parent", "\tChild", "\t\tGrandchild"]).depths).toEqual([0, 1, 2]);
    });

    it("never lets a line drop more than one level deeper than the line above", () => {
        expect(derivePasteLineLayout(["Parent", "      Far too deep"]).depths).toEqual([0, 1]);
    });

    it("measures depth from the shallowest line, so a copied subtree pastes flush", () => {
        expect(derivePasteLineLayout(["    Parent", "      Child", "    Sibling"])).toEqual({
            texts: ["Parent", "Child", "Sibling"],
            depths: [0, 1, 0],
        });
    });

    it("keeps a blank line at the depth of the line before it", () => {
        expect(derivePasteLineLayout(["Parent", "  Child", "", "  Another child"]).depths)
            .toEqual([0, 1, 1, 1]);
    });

    it("leaves unindented lines flat", () => {
        expect(derivePasteLineLayout(["one", "two", "three"]).depths).toEqual([0, 0, 0]);
    });

    it("keeps leading whitespace that does not add up to a level", () => {
        // One space is not half an indent, it is part of the line.
        expect(derivePasteLineLayout([" value"])).toEqual({ texts: [" value"], depths: [0] });
        // Three spaces spend two on one level and leave the third alone.
        expect(derivePasteLineLayout(["parent", "   value"])).toEqual({
            texts: ["parent", " value"],
            depths: [0, 1],
        });
    });
});

describe("spliceMultiLinePaste", () => {
    it.each([
        ["start", 0, ["A"], "AHello", [], 1],
        ["middle", 3, ["A"], "HelAlo", [], 4],
        ["end", 5, ["A"], "HelloA", [], 6],
        ["two lines", 3, ["A", "B"], "HelA", ["Blo"], 1],
        ["many lines", 3, ["A", "B", "C"], "HelA", ["B", "Clo"], 1],
        ["terminal newline", 3, ["A", "B", ""], "HelA", ["Blo"], 1],
    ])("splices at the %s caret", (_name, offset, lines, firstText, siblingTexts, cursorOffset) => {
        expect(spliceMultiLinePaste("Hello", offset as number, lines as string[])).toEqual({
            firstText,
            siblingTexts,
            cursorOffset,
        });
    });

    /**
     * An in-app payload carries one line per copied item. A Grid, Calendar or
     * Layout owns no outline text (#5015), so its line is empty — and trimming
     * a trailing empty line would drop that item and leave the run one shorter
     * than the metadata describing it.
     */
    it("keeps a trailing empty line when every line is a copied item", () => {
        expect(spliceMultiLinePaste("Hello", 5, ["A", ""], { exactLines: true })).toEqual({
            firstText: "HelloA",
            siblingTexts: [""],
            cursorOffset: 0,
        });
    });

    it("still trims a terminal newline from ordinary clipboard text", () => {
        expect(spliceMultiLinePaste("Hello", 5, ["A", ""])).toEqual({
            firstText: "HelloA",
            siblingTexts: [],
            cursorOffset: 6,
        });
    });

    it("returns the text after the caret separately when asked to detach it", () => {
        expect(spliceMultiLinePaste("Hello", 3, ["A", ""], { exactLines: true, detachTail: true })).toEqual({
            firstText: "HelA",
            siblingTexts: [""],
            cursorOffset: 0,
            detachedTail: "lo",
        });
    });
});

describe("detachedPasteTailDepth", () => {
    it("places a tail beside a Layout when the pasted run ends in its visual child", () => {
        expect(detachedPasteTailDepth([0, 1], ["layout", "yjstable"])).toBe(0);
    });

    it("keeps a tail beside a visual child when its parent is ordinary Text", () => {
        expect(detachedPasteTailDepth([0, 1], [undefined, "calendar"])).toBe(1);
    });

    it("climbs out of a nested Layout but keeps the surrounding Text depth", () => {
        expect(detachedPasteTailDepth([0, 1, 2], [undefined, "layout", "yjstable"])).toBe(1);
    });
});
