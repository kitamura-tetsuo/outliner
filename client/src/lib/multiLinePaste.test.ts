import { describe, expect, it } from "vitest";
import { spliceMultiLinePaste } from "./multiLinePaste";

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
});
