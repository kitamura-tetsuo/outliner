import { describe, expect, it } from "vitest";
import { highlightLinkInContext } from "./linkHighlighter";

describe("linkHighlighter", () => {
    it("should highlight internal links", () => {
        const context = "This is a [link] to a page.";
        const pageName = "link";
        const result = highlightLinkInContext(context, pageName);
        expect(result).toBe('This is a <span class="highlight">[link]</span> to a page.');
    });

    it("should highlight project links", () => {
        const context = "See [/proj/page] here.";
        const pageName = "page";
        const result = highlightLinkInContext(context, pageName);
        expect(result).toBe('See <span class="highlight">[/project/page]</span> here.');
    });

    it("should escape HTML in context to prevent XSS", () => {
        const context = "<script>alert(1)</script> [link]";
        const pageName = "link";
        const result = highlightLinkInContext(context, pageName);
        expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt; <span class="highlight">[link]</span>');
        expect(result).not.toContain("<script>");
    });

    it("should handle special characters in page name correctly", () => {
        const context = "Link to [test (1)] page.";
        const pageName = "test (1)";
        const result = highlightLinkInContext(context, pageName);
        expect(result).toBe('Link to <span class="highlight">[test (1)]</span> page.');
    });

    it("should handle regex characters in page name correctly", () => {
        const context = "Link to [test+] page.";
        const pageName = "test+";
        const result = highlightLinkInContext(context, pageName);
        expect(result).toBe('Link to <span class="highlight">[test+]</span> page.');
    });

    it("should handle HTML characters in page name correctly", () => {
        const context = "Link to [<b>bold</b>] page.";
        const pageName = "<b>bold</b>";
        // HTML escaping happens before matching
        // Context becomes: Link to [&lt;b&gt;bold&lt;/b&gt;] page.
        // PageName becomes: &lt;b&gt;bold&lt;/b&gt;
        // Regex matches correctly.
        const result = highlightLinkInContext(context, pageName);
        expect(result).toBe('Link to <span class="highlight">[&lt;b&gt;bold&lt;/b&gt;]</span> page.');
    });

    it("should return escaped text if no pageName provided", () => {
        const context = "<script>";
        const result = highlightLinkInContext(context, "");
        expect(result).toBe("&lt;script&gt;");
    });
});
