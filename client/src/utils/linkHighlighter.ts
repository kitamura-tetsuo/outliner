/**
 * Utility for highlighting links in context securely.
 */

// Helper to escape HTML characters
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Helper to escape RegExp special characters
export function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightLinkInContext(context: string, pageName: string): string {
    if (!context || !pageName) return escapeHtml(context);

    // Escape the context first to prevent XSS
    const safeContext = escapeHtml(context);

    // Escape the page name for HTML context (because it's used in regex to match against safeContext)
    const safePageName = escapeHtml(pageName);

    // Escape for RegExp usage
    const regexSafePageName = escapeRegExp(safePageName);

    // Internal link pattern: [PageName]
    const internalLinkPattern = new RegExp(`\\[(${regexSafePageName})\\]`, "gi");

    // Project link pattern: [/project/PageName]
    const projectLinkPattern = new RegExp(`\\[\\/[^/]+\\/(${regexSafePageName})\\]`, "gi");

    // Highlight links
    const result = safeContext
        .replace(internalLinkPattern, '<span class="highlight">[$1]</span>')
        .replace(projectLinkPattern, '<span class="highlight">[/project/$1]</span>');

    return result;
}
