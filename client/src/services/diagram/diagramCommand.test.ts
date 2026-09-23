import { describe, expect, it } from "vitest";
import { normalizeSourceIntervals } from "./diagramCommand";

describe("Diagram command edit-site normalization (#5311, REQ-006)", () => {
    it("collapses coincident insertion points into one", () => {
        expect(normalizeSourceIntervals([{ start: 1, end: 1 }, { start: 1, end: 1 }])).toEqual([{ start: 1, end: 1 }]);
    });

    it("keeps distinct insertion points distinct", () => {
        expect(normalizeSourceIntervals([{ start: 2, end: 2 }, { start: 0, end: 0 }])).toEqual([
            { start: 0, end: 0 },
            { start: 2, end: 2 },
        ]);
    });

    it("unions overlapping and duplicate ranges", () => {
        expect(normalizeSourceIntervals([{ start: 1, end: 4 }, { start: 3, end: 5 }, { start: 1, end: 4 }])).toEqual([
            { start: 1, end: 5 },
        ]);
    });

    it("absorbs a point touching a range, but keeps touching ranges distinct", () => {
        expect(normalizeSourceIntervals([{ start: 1, end: 3 }, { start: 3, end: 3 }])).toEqual([{ start: 1, end: 3 }]);
        expect(normalizeSourceIntervals([{ start: 0, end: 1 }, { start: 1, end: 2 }])).toEqual([
            { start: 0, end: 1 },
            { start: 1, end: 2 },
        ]);
    });
});
