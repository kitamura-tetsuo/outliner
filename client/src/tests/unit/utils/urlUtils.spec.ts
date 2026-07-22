import { describe, expect, it } from "vitest";
import { safeDecodeURIComponent } from "../../../utils/urlUtils";

describe("urlUtils - safeDecodeURIComponent", () => {
    it("should decode a standard URI component correctly", () => {
        expect(safeDecodeURIComponent("Hello%20World")).toBe("Hello World");
    });

    it("should handle null and undefined", () => {
        expect(safeDecodeURIComponent(null)).toBe("");
        expect(safeDecodeURIComponent(undefined)).toBe("");
    });

    it("should return the original string if decoding fails", () => {
        // A single percent sign is a malformed URI sequence
        expect(safeDecodeURIComponent("Hello%World")).toBe("Hello%World");
    });
});
