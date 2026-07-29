import { describe, expect, it } from "vitest";
import { resolveDefaultWeekStart } from "./calendarLocale";

describe("resolveDefaultWeekStart", () => {
    it("returns a value in the valid weekday range", () => {
        const weekStart = resolveDefaultWeekStart();
        expect(weekStart).toBeGreaterThanOrEqual(0);
        expect(weekStart).toBeLessThanOrEqual(6);
    });
});
