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
        const linkToken = tokens.find(t => t.type === "link");
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

    it("should prevent javascript: protocol bypass via null bytes", () => {
        // Construct a malicious URL with a null byte in the protocol
        const maliciousUrl = "javas\x00cript:alert(1)";

        // 1. Sanitize the URL directly
        const sanitized = ScrapboxFormatter.sanitizeUrl(maliciousUrl);

        // If vulnerable, it returns the URL as-is because "javas\0cript:" doesn't match /^javascript:/
        // If secure, it should detect it (after normalizing) and return "unsafe:..."

        // 2. Simulate what happens in formatToHtml/tokensToHtml
        // escapeHtml strips null bytes
        const finalUrl = ScrapboxFormatter.escapeHtml(sanitized);

        console.log(`Malicious: ${JSON.stringify(maliciousUrl)}`);
        console.log(`Sanitized: ${JSON.stringify(sanitized)}`);
        console.log(`Final:     ${JSON.stringify(finalUrl)}`);

        // The final result MUST NOT start with javascript:
        expect(finalUrl).not.toMatch(/^javascript:/i);

        // It should either be prefixed with unsafe: OR remain broken (javas\0cript) if escapeHtml didn't strip it.
        // But since escapeHtml DOES strip it, sanitizeUrl MUST catch it.
        if (finalUrl.startsWith("unsafe:")) {
            // Good result
            expect(finalUrl).toContain("unsafe:");
        } else {
            // If not marked unsafe, it better not be a working javascript link
            expect(finalUrl).not.toBe("javascript:alert(1)");
        }
    });
});
