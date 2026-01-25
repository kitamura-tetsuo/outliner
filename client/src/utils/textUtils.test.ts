import { describe, expect, it } from "vitest";
import { countCharacters, generateId, truncateText } from "./textUtils";

describe("textUtils", () => {
    describe("countCharacters", () => {
        it("should count ASCII characters correctly", () => {
            expect(countCharacters("abc")).toBe(3);
        });

        it("should count Japanese characters correctly", () => {
            expect(countCharacters("あいう")).toBe(3);
        });

        it("should count surrogate pairs correctly (e.g. emoji)", () => {
            expect(countCharacters("🍎")).toBe(1);
            expect(countCharacters("a🍎b")).toBe(3);
        });
    });

    describe("truncateText", () => {
        it("should not truncate text shorter than maxLength", () => {
            expect(truncateText("abc", 5)).toBe("abc");
        });

        it("should truncate text longer than maxLength and append ellipsis", () => {
            expect(truncateText("abcdef", 3)).toBe("abc...");
        });

        it("should handle surrogate pairs correctly when truncating", () => {
            expect(truncateText("🍎🍊🍇", 2)).toBe("🍎🍊...");
        });
    });

    describe("generateId", () => {
        it("should generate a string ID", () => {
            const id = generateId();
            expect(typeof id).toBe("string");
            expect(id.length).toBeGreaterThan(0);
        });

        it("should generate different IDs", () => {
            const id1 = generateId();
            const id2 = generateId();
            expect(id1).not.toBe(id2);
        });
    });
});
