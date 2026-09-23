// DOM side of the Diagram source projection (issue #5311).
//
// The rendered source view (DiagramBlock.svelte) is a sequence of text runs
// interleaved with caret and preedit decorations. Only text inside
// `[data-source-run]` elements is canonical source; everything else is
// presentation. These helpers translate between DOM positions and canonical
// Y.Text offsets by summing the UTF-16 length of the canonical text nodes, the
// same unit Y.Text and JavaScript strings use.

import { nextCharacterOffset, snapSourceOffset } from "./diagramSourceView";

export const DIAGRAM_SOURCE_SELECTOR = "[data-diagram-source]";

function canonicalTextNodes(root: Element): Text[] {
    const nodes: Text[] = [];
    for (const run of Array.from(root.querySelectorAll("[data-source-run]"))) {
        for (const child of Array.from(run.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) nodes.push(child as Text);
        }
    }
    return nodes;
}

function sourceTextOf(root: Element): string {
    return canonicalTextNodes(root).map(node => node.data).join("");
}

/** Canonical offset of a DOM position inside a rendered source view. */
export function offsetOfDomPosition(root: Element, node: Node, nodeOffset: number): number {
    let total = 0;
    for (const text of canonicalTextNodes(root)) {
        if (text === node) return snapSourceOffset(sourceTextOf(root), total + nodeOffset);
        const position = node.compareDocumentPosition(text);
        // `text` comes after the hit position: the hit lies before this run.
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return total;
        total += text.data.length;
    }
    return total;
}

/** Canonical offset under a viewport point, or undefined when the point is outside the view. */
export function offsetFromPoint(root: Element, clientX: number, clientY: number): number | undefined {
    const doc = root.ownerDocument;
    const position = (doc as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number; } | null;
    }).caretPositionFromPoint?.(clientX, clientY);
    if (position?.offsetNode && root.contains(position.offsetNode)) {
        return offsetOfDomPosition(root, position.offsetNode, position.offset);
    }
    const range = (doc as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; })
        .caretRangeFromPoint?.(clientX, clientY);
    if (range && root.contains(range.startContainer)) {
        return offsetOfDomPosition(root, range.startContainer, range.startOffset);
    }
    return undefined;
}

/** The collapsed DOM position of a canonical offset, for measuring its caret box. */
export function domPositionOfOffset(root: Element, offset: number): { node: Text; offset: number; } | undefined {
    const nodes = canonicalTextNodes(root);
    let remaining = offset;
    for (let i = 0; i < nodes.length; i++) {
        const length = nodes[i].data.length;
        if (remaining <= length && (remaining < length || i === nodes.length - 1)) {
            return { node: nodes[i], offset: remaining };
        }
        remaining -= length;
    }
    return undefined;
}

export interface SourceVisualLine {
    startOffset: number;
    endOffset: number;
    y: number;
}

/**
 * Box of the character (code point) starting at canonical `offset`, measured
 * with a non-collapsed range: a collapsed range at the edge of a text node can
 * report an empty rectangle.
 */
function characterRect(root: Element, source: string, offset: number): DOMRect | undefined {
    const position = domPositionOfOffset(root, offset);
    if (!position) return undefined;
    const length = nextCharacterOffset(source, offset) - offset;
    if (position.offset + length > position.node.data.length) return undefined;
    const range = root.ownerDocument.createRange();
    range.setStart(position.node, position.offset);
    range.setEnd(position.node, position.offset + length);
    return range.getClientRects()[0] ?? range.getBoundingClientRect();
}

/**
 * Visual lines of the rendered source, measured from the layout. Each line is
 * the canonical interval of caret positions it holds; a newline ends a line,
 * and a change of character row inside a logical line is a soft wrap. Probing
 * whole characters never splits a supplementary character.
 */
export function sourceVisualLines(root: Element): SourceVisualLine[] {
    const source = sourceTextOf(root);
    const top = Math.round(root.getBoundingClientRect().top);
    const lines: SourceVisualLine[] = [];
    let lineStart = 0;
    let lineY: number | undefined;
    for (let offset = 0; offset < source.length; offset = nextCharacterOffset(source, offset)) {
        if (source[offset] === "\n") {
            lines.push({ startOffset: lineStart, endOffset: offset, y: lineY ?? top });
            lineStart = offset + 1;
            lineY = undefined;
            continue;
        }
        const rect = characterRect(root, source, offset);
        if (!rect) continue;
        const y = Math.round(rect.top);
        if (lineY === undefined) lineY = y;
        else if (Math.abs(y - lineY) > 2) {
            lines.push({ startOffset: lineStart, endOffset: offset, y: lineY });
            lineStart = offset;
            lineY = y;
        }
    }
    lines.push({ startOffset: lineStart, endOffset: source.length, y: lineY ?? top });
    return lines;
}
