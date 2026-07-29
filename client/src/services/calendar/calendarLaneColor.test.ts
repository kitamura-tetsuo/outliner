import { describe, expect, it } from "vitest";
import { laneColor } from "./calendarLaneColor";

describe("laneColor", () => {
    it("is deterministic for the same label", () => {
        expect(laneColor("work")).toBe(laneColor("work"));
    });

    it("gives the NULL/(none) lane a fixed neutral colour, never a palette slot", () => {
        expect(laneColor("(none)")).toBe("#6b7280");
    });

    it("tends to differ for different labels", () => {
        expect(laneColor("work")).not.toBe(laneColor("urgent"));
    });
});
