// Format utility for Scrapbox format

export class ScrapboxFormatter {
    static escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Checks if the text contains Scrapbox-like formatting
     */
    static hasFormatting(text: string): boolean {
        // Simple check for existence of formatting markers
        // [[bold]], [* bold], [** bold], [/ italic], [- strikethrough], `code`, [http...], [link], > quote
        return /\[\[.*?\]\]|\[\*+ .*?\]|\[\/ .*?\]|\[- .*?\]|`.*?`|\[https?:\/\/.*?\]|\[.*?\]|^> /
            .test(text);
    }

    /**
     * Converts Scrapbox format to HTML (for viewing)
     * Control characters are hidden and formatting is applied.
     */
    static formatToHtml(text: string): string {
        if (!text) return "";

        let html = this.escapeHtml(text);

        // Code block `code` -> <code>code</code>
        html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

        // Bold [[bold]] -> <strong>bold</strong> (Scrapbox notation)
        // Note: Process nested brackets recursively or simply?
        // Prioritize simple implementation first.
        // Process from inside to handle nesting correctly?
        // For now, support simple [[ ]]
        html = html.replace(
            /\[\[((?:(?!\[\[|\]\]).)+)\]\]/g,
            "<strong>$1</strong>",
        );

        // Bold [* bold] -> <strong>bold</strong>
        // Bold (Emphasized) [** bold] -> <strong>bold</strong>
        html = html.replace(/\[(\*+) (.+?)\]/g, "<strong>$2</strong>");

        // Italic [/ italic] -> <em>italic</em>
        html = html.replace(/\[\/ (.+?)\]/g, "<em>$1</em>");

        // Strikethrough [- strikethrough] -> <s>strikethrough</s>
        html = html.replace(/\[- (.+?)\]/g, "<s>$1</s>");

        // Link [http://example.com title] or [title http://example.com] or [http://example.com]
        // Simple implementation
        // 1. [http...] -> <a href="...">...</a>
        html = html.replace(
            /\[(https?:\/\/[^\s\]]+)\]/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
        );

        // 2. [title http...] -> <a href="...">title</a>
        html = html.replace(
            /\[([^\]]+) (https?:\/\/[^\s\]]+)\]/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
        );

        // 3. [http... title] -> <a href="...">title</a>
        html = html.replace(
            /\[(https?:\/\/[^\s\]]+) ([^\]]+)\]/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>',
        );

        // Internal link [Page Title] -> <a href="/project/Page Title">Page Title</a>
        // Exclude those already processed as external links
        // (Since external links contain http, they won't match if excluded here, but simple logic is fine)
        // Match [xxx] that does not contain http
        html = html.replace(
            /\[([^\]]+)\]/g,
            (match, content) => {
                if (content.match(/^https?:\/\//)) return match; // Already processed
                // Ignore decoration system (starting with *, /, -)
                if (content.match(/^[*\\/\\-] /)) return match;
                return `<a href="javascript:void(0)" class="internal-link" data-page="${content}">${content}</a>`;
            },
        );

        // Quote > quote
        if (html.startsWith("&gt; ")) {
            html = `<blockquote>${html.substring(5)}</blockquote>`;
        }

        return html;
    }

    /**
     * Converts Scrapbox format for editing (Control characters visible)
     * Formatting is applied, but control characters are displayed thinly.
     */
    static formatWithControlChars(text: string): string {
        if (!text) return "";

        let html = this.escapeHtml(text);

        // Function to wrap control characters in spans
        const wrapControl = (char: string) => `<span class="control-char">${char}</span>`;

        // Code block `code`
        html = html.replace(
            /`([^`]+)`/g,
            `${wrapControl("`")}<code>$1</code>${wrapControl("`")}`,
        );

        // Bold [[bold]]
        html = html.replace(
            /\[\[((?:(?!\[\[|\]\]).)+)\]\]/g,
            `${wrapControl("[[")}<strong>$1</strong>${wrapControl("]]")}`,
        );

        // Bold [* bold]
        html = html.replace(
            /\[(\*+) (.+?)\]/g,
            (match, stars, content) => {
                return `${wrapControl("[")}<strong>${stars} ${content}</strong>${wrapControl("]")}`;
            },
        );

        // Italic [/ italic]
        html = html.replace(
            /\[\/ (.+?)\]/g,
            `${wrapControl("[/ ")}<em>$1</em>${wrapControl("]")}`,
        );

        // Strikethrough [- strikethrough]
        html = html.replace(
            /\[- (.+?)\]/g,
            `${wrapControl("[- ")}<s>$1</s>${wrapControl("]")}`,
        );

        // Link processing (Simplified)
        // [http://example.com]
        html = html.replace(
            /\[(https?:\/\/[^\s\]]+)\]/g,
            `${wrapControl("[")}<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>${wrapControl("]")}`,
        );

        // Internal link [Page Title]
        // Note: For editing, decorations are just displayed, links are not active (or handled carefully)
        // Here, prioritize structure visualization
        html = html.replace(
            /\[([^\]]+)\]/g,
            (match, content) => {
                // Skip if already processed (contains HTML tags)
                if (match.includes("<span") || match.includes("<a")) {
                    return match;
                }
                // Ignore decorations
                if (content.match(/^[*\\/\\-] /)) return match;

                return `${wrapControl("[")}<span class="internal-link-text">${content}</span>${wrapControl("]")}`;
            },
        );

        // Quote
        if (html.startsWith("&gt; ")) {
            html = `${wrapControl("&gt; ")}<blockquote>${html.substring(5)}</blockquote>`;
        }

        return html;
    }
}
