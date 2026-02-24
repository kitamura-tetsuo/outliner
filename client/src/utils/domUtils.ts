/**
 * Helper to escape an ID for use in a CSS selector.
 * Provides a fallback for environments where CSS.escape is not available (e.g., JSDOM).
 */
export function escapeId(id: string): string {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
}
