/**
 * Helper to escape an ID for use in a CSS selector.
 * Provides a fallback for environments where CSS.escape is not available (e.g., JSDOM).
 */
export function escapeId(id: string): string {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
}

// Measurement span singleton (lazy initialized)
let _measurementSpan: HTMLSpanElement | null = null;
export function getMeasurementSpan(): HTMLSpanElement {
    if (typeof document === 'undefined') return null as unknown as HTMLSpanElement;
    if (!_measurementSpan) {
        _measurementSpan = document.createElement("span");
        _measurementSpan.id = "outliner-measurement-span";
        _measurementSpan.style.whiteSpace = "pre";
        _measurementSpan.style.visibility = "hidden";
        _measurementSpan.style.position = "absolute";
        _measurementSpan.style.top = "-9999px";
        _measurementSpan.style.left = "-9999px";
        // Ensure it is attached
        document.body.appendChild(_measurementSpan);
    } else if (!_measurementSpan.isConnected) {
        document.body.appendChild(_measurementSpan);
    }
    return _measurementSpan;
}
