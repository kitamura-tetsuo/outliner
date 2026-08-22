/**
 * The logical endpoint model of an outline selection (#5025).
 *
 * A selection used to be four numbers-ish fields: an item id and a text offset per end.
 * That worked while every row owned text, but a Grid, Calendar or Layout owns none
 * (#5015), so there is no character boundary to point at inside one. Rather than
 * fabricate an offset for those rows, an endpoint is now one of two things:
 *
 * - a **text** position, a character boundary inside a Text node, exactly as before;
 * - a **node boundary**, the position immediately before or after an atomic visual node.
 *
 * Everything here is free of both the DOM and the outline stores: item order arrives as a
 * comparator, so ordering, normalization and validation stay unit-testable and cannot
 * start depending on where a block happens to be painted.
 */

/** Which side of an atomic visual node a boundary endpoint sits on. */
export type NodeBoundarySide = "before" | "after";

/** A character boundary inside a Text node. */
export interface TextSelectionEndpoint {
    kind: "text";
    itemId: string;
    offset: number;
}

/**
 * The position immediately before or after an atomic node.
 *
 * A visual node is indivisible: the only positions it offers are its two edges, and a
 * selection reaching `after` a node contains it while one stopping `before` it does not.
 */
export interface NodeBoundarySelectionEndpoint {
    kind: "node-boundary";
    itemId: string;
    side: NodeBoundarySide;
}

export type SelectionEndpoint = TextSelectionEndpoint | NodeBoundarySelectionEndpoint;

/** Returns a negative number when `a` precedes `b` in outline (document) order. */
export type ItemOrderComparator = (a: string, b: string) => number;

export function textEndpoint(itemId: string, offset: number): TextSelectionEndpoint {
    return { kind: "text", itemId, offset };
}

export function nodeBoundaryEndpoint(itemId: string, side: NodeBoundarySide): NodeBoundarySelectionEndpoint {
    return { kind: "node-boundary", itemId, side };
}

export function isTextEndpoint(endpoint: SelectionEndpoint): endpoint is TextSelectionEndpoint {
    return endpoint.kind === "text";
}

export function isNodeBoundaryEndpoint(endpoint: SelectionEndpoint): endpoint is NodeBoundarySelectionEndpoint {
    return endpoint.kind === "node-boundary";
}

/** The character offset of a text endpoint, or undefined for a node boundary - never a stand-in. */
export function endpointTextOffset(endpoint: SelectionEndpoint | undefined): number | undefined {
    return endpoint && endpoint.kind === "text" ? endpoint.offset : undefined;
}

export function endpointsEqual(a: SelectionEndpoint, b: SelectionEndpoint): boolean {
    if (a.itemId !== b.itemId || a.kind !== b.kind) return false;
    return a.kind === "text"
        ? a.offset === (b as TextSelectionEndpoint).offset
        : a.side === (b as NodeBoundarySelectionEndpoint).side;
}

/**
 * Where an endpoint sits *within* its own item.
 *
 * `before` precedes every position the item can hold and `after` follows every one, which
 * is what makes the two edges of a node order deterministically against each other and
 * against any text position that shares the item id (a state the model tolerates rather
 * than relies on: a row is either textual or visual, never both).
 */
function rankWithinItem(endpoint: SelectionEndpoint): number {
    if (endpoint.kind === "text") return endpoint.offset;
    return endpoint.side === "before" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
}

/**
 * Order two endpoints by document position: item order first, then position within the item.
 *
 * Subtraction is avoided on purpose - the boundary ranks are infinite, and `Infinity -
 * Infinity` is NaN, which would make the comparator non-deterministic exactly around the
 * visual nodes this model exists for.
 */
export function compareSelectionEndpoints(
    a: SelectionEndpoint,
    b: SelectionEndpoint,
    compareItems: ItemOrderComparator,
): number {
    if (a.itemId !== b.itemId) {
        const order = compareItems(a.itemId, b.itemId);
        if (order !== 0) return order < 0 ? -1 : 1;
        // Items the comparator cannot place (a stale id) are left in the caller's order
        // rather than being ranked by an offset that belongs to a different item.
        return 0;
    }

    const rankA = rankWithinItem(a);
    const rankB = rankWithinItem(b);
    if (rankA === rankB) return 0;
    return rankA < rankB ? -1 : 1;
}

/** A selection re-expressed in document order, with the anchor/focus direction kept aside. */
export interface NormalizedSelection {
    /** The endpoint that comes first in document order. */
    first: SelectionEndpoint;
    /** The endpoint that comes last in document order. */
    last: SelectionEndpoint;
    /** True when the stored start endpoint came after the end one in document order. */
    isVisuallyReversed: boolean;
}

/**
 * Re-order a selection's endpoints by document order.
 *
 * Which content is selected follows from document order alone; the stored anchor/focus
 * direction is preserved separately in `isVisuallyReversed` so a reverse drag selects
 * exactly what the equivalent forward drag does while still knowing which end moved.
 */
export function normalizeSelectionEndpoints(
    start: SelectionEndpoint,
    end: SelectionEndpoint,
    compareItems: ItemOrderComparator,
): NormalizedSelection {
    if (compareSelectionEndpoints(start, end, compareItems) > 0) {
        return { first: end, last: start, isVisuallyReversed: true };
    }
    return { first: start, last: end, isVisuallyReversed: false };
}

/** True when the two endpoints denote the same position, i.e. nothing is selected. */
export function isCollapsedSelection(
    start: SelectionEndpoint,
    end: SelectionEndpoint,
    compareItems: ItemOrderComparator,
): boolean {
    return compareSelectionEndpoints(start, end, compareItems) === 0 && start.itemId === end.itemId;
}

/**
 * The four text fields of a range whose *both* ends are text positions.
 *
 * The narrow adapter for the text-only consumers - the caret, the hidden textarea mirror,
 * plain-text extraction. They keep speaking in offsets; a range that reaches a visual node
 * simply has none to give them, and they say so by getting `undefined` back instead of a
 * fabricated zero.
 */
export function textSelectionEndpoints(range: { start: SelectionEndpoint; end: SelectionEndpoint; }): {
    startItemId: string;
    startOffset: number;
    endItemId: string;
    endOffset: number;
} | undefined {
    const { start, end } = range;
    if (start.kind !== "text" || end.kind !== "text") return undefined;
    return {
        startItemId: start.itemId,
        startOffset: start.offset,
        endItemId: end.itemId,
        endOffset: end.offset,
    };
}

/**
 * True when a range covers something rather than being a collapsed caret position.
 *
 * Two distinct endpoints cover content, whatever kind they are - which is what lets a
 * range from before to after a single Grid count as a selection at all, where comparing
 * two absent text offsets would have called it empty.
 */
export function selectionCoversContent(range: { start: SelectionEndpoint; end: SelectionEndpoint; }): boolean {
    return !endpointsEqual(range.start, range.end);
}

/**
 * The two text offsets of a range, in ascending order.
 *
 * The companion of `textSelectionEndpoints` for the many caret operations that work inside
 * one item and only care which offset is the lower one. Undefined when either end sits at
 * a visual node, so those operations skip a range they have no offsets for.
 */
export function textSelectionOffsetBounds(range: { start: SelectionEndpoint; end: SelectionEndpoint; }): {
    low: number;
    high: number;
} | undefined {
    const endpoints = textSelectionEndpoints(range);
    if (!endpoints) return undefined;
    return {
        low: Math.min(endpoints.startOffset, endpoints.endOffset),
        high: Math.max(endpoints.startOffset, endpoints.endOffset),
    };
}

/**
 * Read one endpoint out of untrusted data (remote presence, an older peer, a replayed
 * payload), or return undefined.
 *
 * Presence is ephemeral, so there is no migration to run: a payload that does not describe
 * a position this build understands is dropped, and the remote user simply renders without
 * a selection instead of taking the overlay down with them.
 */
export function parseSelectionEndpoint(value: unknown): SelectionEndpoint | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const candidate = value as { kind?: unknown; itemId?: unknown; offset?: unknown; side?: unknown; };

    const itemId = candidate.itemId;
    if (typeof itemId !== "string" || itemId.length === 0) return undefined;

    if (candidate.kind === "node-boundary") {
        return candidate.side === "before" || candidate.side === "after"
            ? nodeBoundaryEndpoint(itemId, candidate.side)
            : undefined;
    }

    // `kind` absent means a peer that predates this model: it can only have meant a text
    // position, and it carried the offset alongside the item id.
    if (candidate.kind !== undefined && candidate.kind !== "text") return undefined;

    const offset = candidate.offset;
    if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0) return undefined;
    return textEndpoint(itemId, offset);
}
