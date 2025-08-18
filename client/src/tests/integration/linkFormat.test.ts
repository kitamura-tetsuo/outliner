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
});
