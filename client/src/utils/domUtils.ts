/**
 * Helper to escape an ID for use in a CSS selector.
 * Provides a fallback for environments where CSS.escape is not available (e.g., JSDOM).
 */
export function escapeId(id: string): string {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
}

/**
 * Binary search to find the character offset corresponding to a relative X coordinate.
 * Uses the provided span element to measure widths via Range API to avoid layout thrashing.
 */
export function findBestOffsetBinary(content: string, relX: number, span: HTMLElement): number {
    span.textContent = content;
    const textNode = span.firstChild;

    // Fast path: empty or no text
    if (!textNode) return 0;

    // Fast path: check total width
    const spanRect = span.getBoundingClientRect();
    if (relX > spanRect.width) return content.length;
    if (relX <= 0) return 0;

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 0);

    // Calculate start offset (padding-left equivalent)
    const rangeStartRect = range.getBoundingClientRect();
    const offset = rangeStartRect.left - spanRect.left;

    let low = 0;
    const len = textNode.textContent?.length ?? 0;
    let high = len;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        range.setEnd(textNode, mid);
        const w = range.getBoundingClientRect().width + offset;

        if (w < relX) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    // low is the first index where width >= relX
    let best = low;

    range.setEnd(textNode, low);
    const dist1 = Math.abs((range.getBoundingClientRect().width + offset) - relX);

    if (low > 0) {
        const prev = low - 1;
        range.setEnd(textNode, prev);
        const dist2 = Math.abs((range.getBoundingClientRect().width + offset) - relX);
        if (dist2 < dist1) {
            best = prev;
        }
    }

    return best;
}

// Measurement span singleton (lazy initialized)
let _measurementSpan: HTMLSpanElement | null = null;
export function getMeasurementSpan(): HTMLSpanElement {
    if (typeof document === "undefined") return null as unknown as HTMLSpanElement;
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
