import { describe, expect, it } from "vitest";
import { analyzeCalendarEditability } from "./calendarEditability";

describe("analyzeCalendarEditability", () => {
    it("is editable when both source_kind and source_id are present", () => {
        expect(analyzeCalendarEditability(["source_kind", "source_id", "title", "start_at"]))
            .toEqual({ editable: true });
    });

    it("is read-only, with an explanation, when both are missing", () => {
        const result = analyzeCalendarEditability(["id", "title", "start_at"]);
        expect(result.editable).toBe(false);
        expect(result.readOnlyReason).toMatch(/source_kind/);
        expect(result.readOnlyReason).toMatch(/source_id/);
    });

    it("is read-only when only one of the pair is present", () => {
        expect(analyzeCalendarEditability(["source_kind", "title"]).editable).toBe(false);
        expect(analyzeCalendarEditability(["source_id", "title"]).editable).toBe(false);
    });

    it("is read-only for an empty result", () => {
        expect(analyzeCalendarEditability([]).editable).toBe(false);
    });
});
