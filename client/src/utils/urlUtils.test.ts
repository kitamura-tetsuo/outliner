import { describe, expect, it } from "vitest";
import { safeDecodeURIComponent } from "./urlUtils";

describe("urlUtils", () => {
    describe("safeDecodeURIComponent", () => {
        it("returns empty string for null or undefined", () => {
            expect(safeDecodeURIComponent(null)).toBe("");
            expect(safeDecodeURIComponent(undefined)).toBe("");
        });

        it("decodes valid URI components", () => {
            expect(safeDecodeURIComponent("Hello%20World")).toBe("Hello World");
            expect(safeDecodeURIComponent("Hello%2BWorld")).toBe("Hello+World");
            expect(safeDecodeURIComponent("%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF")).toBe("こんにちは");
        });

        it("returns original string for malformed URI components", () => {
            // Malformed URI string (invalid percentage sequence)
            expect(safeDecodeURIComponent("100%")).toBe("100%");
            expect(safeDecodeURIComponent("Hello%2World")).toBe("Hello%2World");
            expect(safeDecodeURIComponent("%E3%81")).toBe("%E3%81");
        });

        it("returns original string if no encoding is present", () => {
            expect(safeDecodeURIComponent("HelloWorld")).toBe("HelloWorld");
        });
    });
});
