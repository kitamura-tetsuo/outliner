/**
 * Geometry helpers shared by the editor overlay's cursor and selection rendering.
 *
 * The overlay draws carets and selection highlights itself, so it has to translate
 * logical, item-relative character offsets into pixels. Both jobs need exactly the
 * same offset -> DOM position mapping, so that mapping lives here instead of being
 * duplicated (and drifting) inside the component.
 *
 * Everything in this module is free of component state: the DOM-dependent helpers
 * take the nodes/rects they need as arguments, and the ordering helpers take a plain
 * comparator, which keeps the interesting logic unit-testable without a layout engine.
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

/** The endpoints of a logical selection, as stored in EditorOverlayStore. */
export interface SelectionEndpoints {
    startItemId: string;
    startOffset: number;
    endItemId: string;
    endOffset: number;
}

/** A selection re-expressed in visual document order (first endpoint precedes the last one). */
export interface NormalizedSelectionRange {
    firstItemId: string;
    firstOffset: number;
    lastItemId: string;
    lastOffset: number;
    /** True when the stored anchor came after the focus in document order. */
    isVisuallyReversed: boolean;
}

/**
 * Re-order a selection's endpoints by visual document order.
 *
 * The stored `isReversed` flag records anchor/focus direction, and different input paths
 * disagree about whether the anchor is also stored first. Rendering must not depend on that:
 * which characters are highlighted follows from document order alone.
 *
 * @param compareItems Returns a negative number when `a` precedes `b` in document order.
 */
export function normalizeSelectionByVisualOrder(
    selection: SelectionEndpoints,
    compareItems: (a: string, b: string) => number,
): NormalizedSelectionRange {
    const { startItemId, startOffset, endItemId, endOffset } = selection;

    if (startItemId === endItemId) {
        const isVisuallyReversed = startOffset > endOffset;
        return {
            firstItemId: startItemId,
            firstOffset: Math.min(startOffset, endOffset),
            lastItemId: endItemId,
            lastOffset: Math.max(startOffset, endOffset),
            isVisuallyReversed,
        };
    }

    if (compareItems(startItemId, endItemId) <= 0) {
        return {
            firstItemId: startItemId,
            firstOffset: startOffset,
            lastItemId: endItemId,
            lastOffset: endOffset,
            isVisuallyReversed: false,
        };
    }

    return {
        firstItemId: endItemId,
        firstOffset: endOffset,
        lastItemId: startItemId,
        lastOffset: startOffset,
        isVisuallyReversed: true,
    };
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

/**
 * One drawable piece of a selection (#5024).
 *
 * The selection's endpoints stay text positions, but the items between them need not all
 * be Text nodes, so what gets drawn is a mixed list: character intervals for Text nodes,
 * whole-node rectangles for the textless visual nodes in between.
 */
export type SelectionFragment =
    | { kind: "text"; itemId: string; startOffset: number; endOffset: number; }
    | { kind: "node"; itemId: string; };

/** What the renderer knows about one item covered by a selection's range. */
export interface SelectionRangeItem {
    itemId: string;
    /** True for Grid/Calendar/Layout — a node that owns no outline text (#5015). */
    isVisual: boolean;
    /** Length of the item's rendered text. Meaningless for a visual node. */
    textLength: number;
    /** Enclosing item, when this one renders inside another (a Layout's children). */
    parentItemId?: string;
}

/**
 * Turn the items a selection spans into the fragments to draw, in document order.
 *
 * Three rules, and no block-specific knowledge beyond them:
 *
 * - a Text node contributes its selected character interval, exactly as before;
 * - a visual node *strictly between* the endpoints is atomic: it contributes one node
 *   fragment, never text offsets. An endpoint is a text position, so a visual node that
 *   is one is a selection the drag stopped at rather than reached, and it stays out;
 * - a node drawn inside an already selected visual node contributes nothing, because it
 *   is already inside that node's rectangle. That is what makes a selected Layout render
 *   as one container instead of as a stack of its children's boxes.
 */
export function buildSelectionFragments(
    items: readonly SelectionRangeItem[],
    normalized: NormalizedSelectionRange,
): SelectionFragment[] {
    const fragments: SelectionFragment[] = [];
    // Items whose own rectangle already covers everything rendered inside them.
    const absorbing = new Set<string>();

    for (const item of items) {
        if (item.parentItemId !== undefined && absorbing.has(item.parentItemId)) {
            absorbing.add(item.itemId);
            continue;
        }

        if (item.isVisual) {
            // Whether or not it is drawn, its children are part of its picture.
            absorbing.add(item.itemId);
            const isEndpoint = item.itemId === normalized.firstItemId || item.itemId === normalized.lastItemId;
            if (!isEndpoint) fragments.push({ kind: "node", itemId: item.itemId });
            continue;
        }

        const interval = getItemSelectionInterval(item.itemId, normalized, item.textLength);
        if (interval) fragments.push({ kind: "text", itemId: item.itemId, ...interval });
    }

    return fragments;
}

/**
 * Selected character interval for one item of a normalized selection.
 *
 * Items strictly between the endpoints are fully selected; the first and last items are
 * clipped by their offsets. Returns undefined when nothing of the item is selected.
 */
export function getItemSelectionInterval(
    itemId: string,
    normalized: NormalizedSelectionRange,
    textLength: number,
): { startOffset: number; endOffset: number; } | undefined {
    const clamp = (offset: number) => Math.max(0, Math.min(textLength, offset));

    const isFirst = itemId === normalized.firstItemId;
    const isLast = itemId === normalized.lastItemId;

    const startOffset = isFirst ? clamp(normalized.firstOffset) : 0;
    const endOffset = isLast ? clamp(normalized.lastOffset) : textLength;

    if (startOffset >= endOffset) return undefined;
    return { startOffset, endOffset };
}
