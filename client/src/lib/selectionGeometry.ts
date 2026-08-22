/**
 * Geometry helpers shared by the editor overlay's cursor and selection rendering.
 *
 * The overlay draws carets and selection highlights itself, so it has to translate
 * logical, item-relative character offsets into pixels. Both jobs need exactly the
 * same offset -> DOM position mapping, so that mapping lives here instead of being
 * duplicated (and drifting) inside the component.
 *
 * Everything in this module is free of component state: the helpers take the nodes and
 * rects they need as arguments. What a selection *contains* is decided one level up, in
 * `lib/selection/`, from the outline model alone - geometry only turns the answer into
 * pixels, so selection semantics can never start depending on where a block is painted.
 */

/** A concrete text node plus an offset inside that node. */
export interface TextNodePosition {
    node: Text;
    offset: number;
}

/** A rectangle expressed in the overlay's coordinate system (relative to the tree container). */
export interface OverlayRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Minimal shape of a viewport rectangle, so callers can pass DOMRect or a plain object. */
export interface ViewportRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

export interface RectConversionOptions {
    /** Scroll offset of the container the overlay is positioned against. */
    scrollTop?: number;
    /** Pixels subtracted from every top, compensating the item's padding-top. */
    topAdjust?: number;
    /** Clip fragments horizontally to this range (viewport coordinates). */
    clipLeft?: number;
    clipRight?: number;
}

/**
 * Resolve an element-relative character offset to the text node that contains it.
 *
 * Formatted items render nested inline elements, so the visible text is spread over
 * several text nodes. The walker mirrors how the rest of the editor counts characters:
 * plain `textContent` order, no per-element special cases.
 */
export function findTextPositionInElement(element: Node, targetOffset: number): TextNodePosition | undefined {
    if (targetOffset < 0) return undefined;

    let currentOffset = 0;
    let lastTextNode: Text | undefined;

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: function() {
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    while (walker.nextNode()) {
        const textNode = walker.currentNode as Text;
        lastTextNode = textNode;
        const textLength = textNode.textContent?.length || 0;

        if (targetOffset < currentOffset + textLength) {
            return { node: textNode, offset: targetOffset - currentOffset };
        }

        currentOffset += textLength;
    }

    // The very end of the text is a valid caret/selection boundary.
    if (targetOffset === currentOffset && lastTextNode) {
        return { node: lastTextNode, offset: lastTextNode.textContent?.length || 0 };
    }

    return undefined;
}

/**
 * Build a DOM Range covering [startOffset, endOffset) inside `element`.
 * Returns undefined when either boundary cannot be resolved (e.g. empty item).
 */
export function createRangeForOffsets(element: Node, startOffset: number, endOffset: number): Range | undefined {
    const start = findTextPositionInElement(element, startOffset);
    const end = findTextPositionInElement(element, endOffset);
    if (!start || !end) return undefined;

    const range = document.createRange();
    const safeStart = Math.max(0, Math.min(start.offset, start.node.textContent?.length || 0));
    const safeEnd = Math.max(0, Math.min(end.offset, end.node.textContent?.length || 0));
    range.setStart(start.node, safeStart);
    range.setEnd(end.node, safeEnd);
    return range;
}

/**
 * Convert viewport rectangles (typically `Range.getClientRects()`) into overlay coordinates.
 *
 * Every rectangle the browser reports for a range is one fragment of a visual line, so a
 * selection that wraps naturally comes back as several rectangles instead of one wide box.
 */
export function convertClientRectsToOverlayRects(
    rects: ArrayLike<ViewportRect>,
    containerRect: { left: number; top: number; },
    options: RectConversionOptions = {},
): OverlayRect[] {
    const { scrollTop = 0, topAdjust = 0, clipLeft, clipRight } = options;
    const result: OverlayRect[] = [];

    for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (!rect) continue;
        if (rect.width <= 0 || rect.height <= 0) continue;

        const left = clipLeft === undefined ? rect.left : Math.max(rect.left, clipLeft);
        const right = clipRight === undefined ? rect.right : Math.min(rect.right, clipRight);
        const width = right - left;
        if (width <= 0) continue;

        result.push({
            left: left - containerRect.left,
            top: rect.top - containerRect.top + scrollTop - topAdjust,
            width,
            height: rect.height,
        });
    }

    return result;
}

/** Largest gap, in pixels, still treated as two boxes touching rather than being separated. */
const FRAGMENT_JOIN_TOLERANCE = 1;

/**
 * Merge rectangles that belong to the same visual line into a single fragment.
 *
 * Formatted text produces one rectangle per inline box, which would otherwise render as a
 * row of adjacent highlights with hairline seams between them. Rectangles are considered to
 * be on the same line when their vertical centers fall inside each other's span, and are
 * only merged when they also touch or overlap horizontally: a range over bidirectional text
 * can put two genuinely separated runs on one line, and bridging them would highlight the
 * unselected characters in between.
 */
export function mergeRectsIntoLines(rects: OverlayRect[]): OverlayRect[] {
    if (rects.length <= 1) return [...rects];

    const sorted = [...rects].sort((a, b) => (a.top - b.top) || (a.left - b.left));
    const lines: OverlayRect[] = [];

    for (const rect of sorted) {
        const current = lines[lines.length - 1];
        const center = rect.top + rect.height / 2;
        const sameLine = current !== undefined
            && center >= current.top
            && center <= current.top + current.height;
        const touchesHorizontally = current !== undefined
            && rect.left <= current.left + current.width + FRAGMENT_JOIN_TOLERANCE
            && rect.left + rect.width >= current.left - FRAGMENT_JOIN_TOLERANCE;

        if (!sameLine || !touchesHorizontally) {
            lines.push({ ...rect });
            continue;
        }

        const left = Math.min(current.left, rect.left);
        const right = Math.max(current.left + current.width, rect.left + rect.width);
        const top = Math.min(current.top, rect.top);
        const bottom = Math.max(current.top + current.height, rect.top + rect.height);
        current.left = left;
        current.width = right - left;
        current.top = top;
        current.height = bottom - top;
    }

    return lines;
}

/**
 * Attribute marking the element whose box *is* a visual node, for selection purposes.
 *
 * A Grid or Calendar renders a whole interactive view, and a Layout renders a grid of
 * further blocks; none of them owns outline text (#5015), so a selection cannot be drawn
 * from character rectangles. It is drawn from this one element instead, which keeps the
 * overlay independent of every block's internal markup: a block joins the model by
 * carrying the attribute, not by teaching the overlay about its innards.
 */
export const VISUAL_NODE_ROOT_ATTRIBUTE = "data-visual-node-root";
