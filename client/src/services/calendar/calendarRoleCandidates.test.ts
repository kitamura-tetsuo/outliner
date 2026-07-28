import { describe, expect, it } from "vitest";
import { mergeCandidates } from "./calendarRoleCandidates";

describe("mergeCandidates", () => {
    it("returns the result columns unchanged when nothing is assigned", () => {
        expect(mergeCandidates(["a", "b"], [])).toEqual(["a", "b"]);
        expect(mergeCandidates(["a", "b"], [undefined])).toEqual(["a", "b"]);
    });

    it("returns the result columns unchanged when the assignment is already a candidate", () => {
        expect(mergeCandidates(["a", "b"], ["a"])).toEqual(["a", "b"]);
    });

    it("keeps a temporarily-absent assignment visible, ahead of the current result", () => {
        expect(mergeCandidates(["a", "b"], ["c"])).toEqual(["c", "a", "b"]);
    });

    it("keeps every temporarily-absent assignment (group axes) without duplication", () => {
        expect(mergeCandidates(["a"], ["c", "d", "a"])).toEqual(["c", "d", "a"]);
    });

    it("survives a query change: assignment absent, then present again", () => {
        const assignedColumn = "tags";
        expect(mergeCandidates(["title", "start_at"], [assignedColumn])).toEqual(["tags", "title", "start_at"]);
        expect(mergeCandidates(["title", "start_at", "tags"], [assignedColumn])).toEqual([
            "title",
            "start_at",
            "tags",
        ]);
    });
});
