import { describe, expect, it } from "vitest";
import { safeDecodeURIComponent } from "./urlUtils";

describe("urlUtils", () => {
    describe("safeDecodeURIComponent", () => {
        it("should return empty string for null or undefined", () => {
            expect(safeDecodeURIComponent(null as unknown as string)).toBe("");
            expect(safeDecodeURIComponent(undefined)).toBe("");
        });

        it("should successfully decode valid URI components", () => {
            expect(safeDecodeURIComponent("Hello%20World")).toBe("Hello World");
            expect(safeDecodeURIComponent("%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF")).toBe("こんにちは");
        });

        it("should return the original string for malformed URI components", () => {
            expect(safeDecodeURIComponent("%")).toBe("%");
            expect(safeDecodeURIComponent("%E3%81")).toBe("%E3%81");
            expect(safeDecodeURIComponent("Hello%World")).toBe("Hello%World");
        });
    });
});
