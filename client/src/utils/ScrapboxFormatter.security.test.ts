import { describe, expect, it } from "vitest";
import { ScrapboxFormatter } from "./ScrapboxFormatter";

describe("ScrapboxFormatter Security", () => {
    describe("Null Byte Injection", () => {
        it("should strip null bytes from input", () => {
            const input = "Hello\x00World";
            // Current behavior: passes through (fail safe)
            // Desired behavior: "HelloWorld" or "Hello&#0;World" (but null byte is invalid in HTML)
            // We choose to strip it.
            const result = ScrapboxFormatter.escapeHtml(input);
            expect(result).not.toContain("\x00");
            expect(result).toBe("HelloWorld");
        });

        it("should strip null bytes even in formatted text", () => {
            const input = "[[Hello\x00World]]";
            const result = ScrapboxFormatter.formatToHtml(input);
            expect(result).not.toContain("\x00");
            expect(result).toBe("<strong>HelloWorld</strong>");
        });

        it("should prevent interference with placeholder system", () => {
            // Attempt to mimic internal placeholder format
            const input = "\x00HTML_0\x00";
            const result = ScrapboxFormatter.formatToHtml(input);
            // It should be stripped to "HTML_0"
            expect(result).toBe("HTML_0");
        });
    });
});
