import { describe, expect, it } from "vitest";
import { ScrapboxFormatter } from "../../utils/ScrapboxFormatter";

describe("link formatting integration", () => {
    it("converts [URL label] into anchor with label text", () => {
        const input = "Check [https://example.com Example Site]";
        const html = ScrapboxFormatter.formatToHtml(input);
        expect(html).toContain(
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Example Site</a>',
        );
    });

    it("converts plain URL into clickable link", () => {
        const input = "Visit https://example.com";
        const html = ScrapboxFormatter.formatToHtml(input);
        expect(html).toContain(
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>',
        );
    });

    it("does not linkify URLs inside double brackets", () => {
        const input = "[[https://x.com label]]";
        const html = ScrapboxFormatter.formatToHtml(input);
        expect(html).not.toContain('<a href="https://x.com"');
    });

    it("does not linkify URLs when brackets remain open", () => {
        const input = "[[foo https://bar.com]]";
        const html = ScrapboxFormatter.formatToHtml(input);
        expect(html).not.toContain('<a href="https://bar.com"');
    });
});
