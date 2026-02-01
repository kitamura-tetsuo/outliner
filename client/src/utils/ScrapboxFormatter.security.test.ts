import { describe, expect, it } from "vitest";
import { ScrapboxFormatter } from "./ScrapboxFormatter";

describe("ScrapboxFormatter Security", () => {
    it("should not allow javascript: URIs in external links", () => {
        const input = "[javascript:alert('xss')]";
        const html = ScrapboxFormatter.formatToHtml(input);
        console.log("Input: " + input);
        console.log("Output: " + html);
        expect(html).not.toContain('href="javascript:');
    });

    it("should not allow javascript: URIs in external links with label", () => {
        const input = "[javascript:alert('xss') Click Me]";
        const html = ScrapboxFormatter.formatToHtml(input);
        console.log("Input: " + input);
        console.log("Output: " + html);
        expect(html).not.toContain('href="javascript:');
    });

    // Check if tokenize allows it
    it("should not tokenize javascript: URIs as links", () => {
        const input = "[javascript:alert('xss')]";
        const tokens = ScrapboxFormatter.tokenize(input);
        const linkToken = tokens.find(t => t.type === 'link');
        if (linkToken) {
             console.log("Token URL: " + linkToken.url);
             expect(linkToken.url).not.toMatch(/^javascript:/i);
        }
    });

    it("should handle internal links correctly without executing JS", () => {
        const input = "[javascript:alert('xss')]";
        // If it treats as internal link, it should prepend project path
        const html = ScrapboxFormatter.formatToHtml(input);
        // It might match internal link regex: /\[([^[\]]+?)\]/
        // If so, it generates <a href="/ProjectPrefix/javascript:alert('xss')">
        // This is safe because it is relative.

        // However, we want to ensure it doesn't generate <a href="javascript:...">
        expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
    });

    it("should not allow user to spoof placeholders", () => {
        // We create a situation where a placeholder is created (HTML_0)
        // And we try to reference it manually in the input

        // Input: [[bold]] \x01HTML_0\x01
        // The first part [[bold]] will be processed and replaced by \x01HTML_0\x01 internally.
        // The second part is user input.

        const input = "[[bold]] \x01HTML_0\x01";
        const html = ScrapboxFormatter.formatToHtml(input);

        // If vulnerable, the output will contain <strong>bold</strong> twice.
        // If secure, the second part should be treated as text (escaped or stripped).

        const matches = html.match(/<strong>bold<\/strong>/g);

        // We expect only 1 occurrence (the real one)
        expect(matches?.length).toBe(1);
    });
});
