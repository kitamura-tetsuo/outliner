import { describe, expect, it } from "vitest";
import { ScrapboxFormatter } from "./ScrapboxFormatter";

describe("ScrapboxFormatter", () => {
    describe("escapeHtml", () => {
        it("should escape special characters", () => {
            expect(ScrapboxFormatter.escapeHtml('<div>"&"</div>')).toBe(
                "&lt;div&gt;&quot;&amp;&quot;&lt;/div&gt;",
            );
        });
    });

    describe("hasFormatting", () => {
        it("should detect bold formatting", () => {
            expect(ScrapboxFormatter.hasFormatting("text [[bold]] text")).toBe(
                true,
            );
            expect(ScrapboxFormatter.hasFormatting("text [* bold] text")).toBe(
                true,
            );
        });

        it("should detect italic formatting", () => {
            expect(ScrapboxFormatter.hasFormatting("text [/ italic] text"))
                .toBe(true);
        });

        it("should detect strikethrough formatting", () => {
            expect(
                ScrapboxFormatter.hasFormatting("text [- strikethrough] text"),
            ).toBe(true);
        });

        it("should detect code formatting", () => {
            expect(ScrapboxFormatter.hasFormatting("text `code` text")).toBe(
                true,
            );
        });

        it("should detect links", () => {
            expect(ScrapboxFormatter.hasFormatting("text [http://example.com]"))
                .toBe(true);
            expect(ScrapboxFormatter.hasFormatting("text [page]")).toBe(true);
        });

        it("should detect quotes", () => {
            expect(ScrapboxFormatter.hasFormatting("> quote")).toBe(true);
        });

        it("should return false for plain text", () => {
            expect(ScrapboxFormatter.hasFormatting("plain text")).toBe(false);
        });
    });

    describe("formatToHtml", () => {
        it("should format bold text", () => {
            expect(ScrapboxFormatter.formatToHtml("[[bold]]")).toBe(
                "<strong>bold</strong>",
            );
            expect(ScrapboxFormatter.formatToHtml("[* bold]")).toBe(
                "<strong>bold</strong>",
            );
        });

        it("should format italic text", () => {
            expect(ScrapboxFormatter.formatToHtml("[/ italic]")).toBe(
                "<em>italic</em>",
            );
        });

        it("should format strikethrough text", () => {
            expect(ScrapboxFormatter.formatToHtml("[- strikethrough]")).toBe(
                "<s>strikethrough</s>",
            );
        });

        it("should format code blocks", () => {
            expect(ScrapboxFormatter.formatToHtml("`code`")).toBe(
                "<code>code</code>",
            );
        });

        it("should format external links", () => {
            expect(
                ScrapboxFormatter.formatToHtml("[http://example.com]"),
            ).toContain('<a href="http://example.com"');
        });

        it("should format internal links", () => {
            expect(ScrapboxFormatter.formatToHtml("[Page Title]")).toContain(
                'data-page="Page Title"',
            );
        });

        it("should format quotes", () => {
            expect(ScrapboxFormatter.formatToHtml("> quote")).toBe(
                "<blockquote>quote</blockquote>",
            );
        });
    });
});
