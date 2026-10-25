import { describe, expect, it } from "vitest";

import { nearestVisualCaret } from "../../../lib/cursor/CursorTextUtils";

describe("ordinary vertical caret pixel goal", () => {
    const row = [
        { offset: 4, x: 108, y: 20 },
        { offset: 5, x: 116, y: 20 },
        { offset: 6, x: 131, y: 20 },
    ];

    it("chooses the rendered caret nearest the retained CSS-pixel X", () => {
        expect(nearestVisualCaret(row, 126)).toEqual(row[2]);
        expect(nearestVisualCaret(row, 117)).toEqual(row[1]);
    });

    it("uses the smaller model offset when candidates are equally distant", () => {
        expect(nearestVisualCaret(row, 112)).toEqual(row[0]);
    });

    it("clamps goals outside a row to its rendered endpoints", () => {
        expect(nearestVisualCaret(row, -100)).toEqual(row[0]);
        expect(nearestVisualCaret(row, 500)).toEqual(row[2]);
    });
});
