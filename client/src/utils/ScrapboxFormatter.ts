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
        // [[bold]], [* bold], [** bold], [/ italic], [- strikethrough], [_ underline], `code`, [http...], [link], > quote
        return /\[\[.*?\]\]|\[\*+ .*?\]|\[\/ .*?\]|\[- .*?\]|\[_ .*?\]|`.*?`|\[https?:\/\/.*?\]|\[.*?\]|^> /
            .test(text);
    }

    /**
     * Converts Scrapbox format to HTML (for viewing)
     * Control characters are hidden and formatting is applied.
     * @param text Original text
     * @param projectTitle Current project title for internal links (optional)
     */
    static formatToHtml(text: string, projectTitle?: string): string {
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

        // Link [http://example.com title] or [title http://example.com] or [http://example.com]
        // 1. [http...] -> <a href="...">...</a>
        // (Simplified external link processing)
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

        // 4. Decoration sequences: [[...]], [/ ...], [- ...]
        // Support optional space after marker for better compatibility with tests (e.g. [-text])
        // Bold: [[text]]
        html = html.replace(/\[\[([^\]]+)\]\]/g, "<strong>$1</strong>");
        // Slash: [/ text] or [/text] - BUT NOT [/project/page]
        // If there's a space, it's definitely decoration.
        html = html.replace(/\[\/ +([^\]]+)\]/g, "<em>$1</em>");
        // If no space, exclude if it contains a / (project link)
        html = html.replace(/\[\/([^ /][^\]/]*?)\]/g, "<em>$1</em>");
        // Strike: [- text] or [-text]
        html = html.replace(/\[- ?([^\]]+)\]/g, "<s>$1</s>");
        // Underline: [_ text] or [_text]
        html = html.replace(/\[_ ?([^\]]+)\]/g, "<u>$1</u>");

        // Internal link [Page Title] -> <a href="/project/Page Title">Page Title</a>
        // Exclude those already processed as external links or decorations
        html = html.replace(
            /\[([^\]]+)\]/g,
            (match, content) => {
                if (content.match(/^https?:\/\//)) return match; // Already processed
                // Ignore decoration system (starting with *, /, -)
                // BUT [/project/page] is a project link, so don't ignore if it contains another /
                if (
                    content.match(/^[*\\-]/) || content.startsWith("/ ")
                    || (content.startsWith("/") && !content.substring(1).includes("/"))
                ) return match;

                let href = "javascript:void(0)";
                const classes = ["internal-link"];

                if (content.startsWith("/")) {
                    classes.push("project-link");
                    href = content;
                    const parts = content.split("/").filter(Boolean);
                    if (parts.length >= 2) {
                        const project = parts[0];
                        const page = parts.slice(1).join("/");
                        return `<a href="${href}" class="${
                            classes.join(" ")
                        }" data-project="${project}" data-page="${page}">${content.replace(/^\//, "")}</a>`;
                    }
                } else if (projectTitle) {
                    const encodedProject = encodeURIComponent(projectTitle);
                    const encodedPage = encodeURIComponent(content);
                    href = `/${encodedProject}/${encodedPage}`;
                }

                return `<a href="${href}" class="${classes.join(" ")}" data-page="${content}">${
                    content.replace(/^\//, "")
                }</a>`;
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
     * @param text Original text
     * @param projectTitle Current project title for internal links (optional)
     */
    static formatWithControlChars(text: string, _projectTitle?: string): string { // eslint-disable-line @typescript-eslint/no-unused-vars
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
            /\[\[(.+?)\]\]/g,
            `${wrapControl("[")}${wrapControl("[")}<strong>$1</strong>${wrapControl("]")}${wrapControl("]")}`,
        );

        // Bold [* bold]
        html = html.replace(
            /\[(\*+) (.+?)\]/g,
            (match, stars, content) => {
                let starsHtml = "";
                for (const star of stars) {
                    starsHtml += wrapControl(star);
                }
                return `${wrapControl("[")}${starsHtml} <strong>${content}</strong>${wrapControl("]")}`;
            },
        );

        // Italic [/ italic] or [/italic]
        html = html.replace(
            /\[\/ +([^\]]+)\]/g,
            (match, content) => {
                return `${wrapControl("[")}${wrapControl("/")} <em>${content}</em>${wrapControl("]")}`;
            },
        );
        html = html.replace(
            /\[\/([^ /][^\]/]*?)\]/g,
            (match, content) => {
                return `${wrapControl("[")}${wrapControl("/")}<em>${content}</em>${wrapControl("]")}`;
            },
        );

        // Strikethrough [- strikethrough] or [-strikethrough]
        html = html.replace(
            /\[- ?(.+?)\]/g,
            (match, content) => {
                const space = match.includes("[- ") ? " " : "";
                return `${wrapControl("[")}${wrapControl("-")}${space}<s>${content}</s>${wrapControl("]")}`;
            },
        );

        // Underline [_ underline] or [_underline]
        html = html.replace(
            /\[_ ?(.+?)\]/g,
            (match, content) => {
                const space = match.includes("[_ ") ? " " : "";
                return `${wrapControl("[")}${wrapControl("_")}${space}<u>${content}</u>${wrapControl("]")}`;
            },
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
                if (
                    content.match(/^[*\\-_]/) || content.startsWith("/ ")
                    || (content.startsWith("/") && !content.substring(1).includes("/"))
                ) return match;

                const classes = ["internal-link-text"];
                if (content.startsWith("/")) {
                    classes.push("project-link");
                }

                return `${wrapControl("[")}<span class="${classes.join(" ")}">${content}</span>${wrapControl("]")}`;
            },
        );

        // Quote
        if (html.startsWith("&gt; ")) {
            html = `${wrapControl("&gt; ")}<blockquote>${html.substring(5)}</blockquote>`;
        }

        return html;
    }
    static bold(text: string): string {
        return `[[${text}]]`;
    }

    static italic(text: string): string {
        return `[/ ${text}]`;
    }

    static strikethrough(text: string): string {
        return `[- ${text}]`;
    }

    static underline(text: string): string {
        return `[_ ${text}]`;
    }

    static code(text: string): string {
        return `\`${text}\``;
    }
}
