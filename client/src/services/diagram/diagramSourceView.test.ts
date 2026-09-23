import { describe, expect, it } from "vitest";
import {
    buildSourceSegments,
    nextCharacterOffset,
    previousCharacterOffset,
    snapSourceOffset,
} from "./diagramSourceView";

describe("Diagram source projection uses canonical UTF-16 offsets (#5311)", () => {
    it("slices a supplementary character as two code units, matching Y.Text", () => {
        const segments = buildSourceSegments("😀a", [{ key: "c", offset: 2 }], []);
        expect(segments).toEqual([
            { kind: "text", key: "text:0", start: 0, end: 2, text: "😀", selected: false },
            { kind: "caret", key: "caret:c", offset: 2 },
            { kind: "text", key: "text:2", start: 2, end: 3, text: "a", selected: false },
        ]);
    });

    it("paints a caret at the canonical end offset", () => {
        const segments = buildSourceSegments("😀a", [{ key: "c", offset: 3 }], []);
        expect(segments.at(-1)).toEqual({ kind: "caret", key: "caret:c", offset: 3 });
    });

    it("never splits a surrogate pair", () => {
        expect(snapSourceOffset("😀a", 1)).toBe(0);
        expect(previousCharacterOffset("😀a", 2)).toBe(0);
        expect(nextCharacterOffset("😀a", 0)).toBe(2);
        expect(nextCharacterOffset("😀a", 2)).toBe(3);
    });

    it("marks selected runs and places preedit at its anchor", () => {
        const segments = buildSourceSegments("abcd", [], [{ start: 1, end: 3 }], [{ offset: 1, text: "日" }]);
        expect(segments.map(s => s.kind === "text" ? `${s.text}:${s.selected}` : `${s.kind}`)).toEqual([
            "a:false",
            "preedit",
            "bc:true",
            "d:false",
        ]);
    });
});
