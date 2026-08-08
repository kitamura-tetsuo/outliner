/**
 * Utility functions for mapping DOM positions to raw text offsets in OutlinerItem.
 * This optimizes cursor positioning performance by avoiding expensive fallback logic.
 */

import { findBestOffsetBinary, getMeasurementSpan } from "./domUtils";

/** A viewport point. Any MouseEvent/PointerEvent satisfies this structurally. */
export interface CaretPoint {
    clientX: number;
    clientY: number;
}

/**
 * Maps a viewport point to a raw text offset inside a rendered item.
 *
 * Pointer-type agnostic: mouse, touch and pen all funnel through here, so the same
 * caret mapping backs desktop clicks and touch taps/long-press selection.
 *
 * @param textEl The `.item-text` element, if the item rendered one.
 * @param fallbackEl Element to measure against when `textEl` is missing.
 * @param clientX Viewport X coordinate.
 * @param clientY Viewport Y coordinate.
 * @param content Raw (unrendered) item text the offset must index into.
 */
export function getTextOffsetAtPoint(
    textEl: HTMLElement | null,
    fallbackEl: HTMLElement,
    clientX: number,
    clientY: number,
    content: string,
): number {
    type CaretPositionFromPoint = (x: number, y: number) => { offsetNode: Node; offset: number; } | null;
    const caretPositionFromPoint =
        (document as Document & { caretPositionFromPoint?: CaretPositionFromPoint; }).caretPositionFromPoint;

    // Try Caret API (Fast Path)
    // Only use if rendered text length matches raw content length (avoids issues with hidden formatting/links)
    if (
        textEl && (document.caretRangeFromPoint || caretPositionFromPoint)
        && textEl.textContent?.length === content.length
    ) {
        let range: Range | null = null;
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(clientX, clientY);
        } else {
            const posInfo = caretPositionFromPoint?.call(document, clientX, clientY);
            if (posInfo) {
                range = document.createRange();
                range.setStart(posInfo.offsetNode, posInfo.offset);
                range.collapse(true);
            }
        }

        if (range && textEl.contains(range.startContainer)) {
            // Calculate global offset avoiding O(N) layout thrashing
            return calculateGlobalOffset(textEl, range.startContainer, range.startOffset);
        }
    }

    // Fallback: width measurement using span
    // Use entire content if no text element
    const targetElement = textEl || fallbackEl;
    const rect = targetElement.getBoundingClientRect();
    const relX = clientX - rect.left;

    // Processing when the point is outside the text area
    if (relX < 0) {
        return 0; // Beginning if to the left of the text
    }

    const span = getMeasurementSpan();
    const style = window.getComputedStyle(targetElement);

    // Only update styles if they differ (avoid unnecessary property writes)
    if (
        span.style.fontSize !== style.fontSize
        || span.style.fontFamily !== style.fontFamily
        || span.style.fontWeight !== style.fontWeight
        || span.style.letterSpacing !== style.letterSpacing
    ) {
        span.style.fontFamily = style.fontFamily;
        span.style.fontSize = style.fontSize;
        span.style.fontWeight = style.fontWeight;
        span.style.letterSpacing = style.letterSpacing;
    }

    // Span remains in DOM for reuse
    return findBestOffsetBinary(content, relX, span);
}

/**
 * Calculates the global offset of a cursor position within a root element.
 * This maps a DOM selection (node + offset) to a linear index in the text content of the root.
 *
 * @param root The container element (e.g., .item-text)
 * @param node The node where the cursor is (startContainer)
 * @param offset The offset within that node (startOffset)
 * @returns The global offset relative to the start of root's textContent.
 */
export function calculateGlobalOffset(root: HTMLElement, node: Node, offset: number): number {
    if (node.nodeType !== Node.TEXT_NODE) {
        // If node is an Element, offset is the child index.
        // We sum the text lengths of all children before the offset index.
        let localOffset = 0;
        // Limit loop to childNodes.length to prevent errors if offset is out of bounds
        const maxIndex = Math.min(offset, node.childNodes.length);

        for (let i = 0; i < maxIndex; i++) {
            localOffset += node.childNodes[i].textContent?.length || 0;
        }

        // Then we add the offset of 'node' itself relative to 'root'.
        // This 'localOffset' effectively puts us at the start of the child at 'offset'.
        return localOffset + getOffsetOfNode(root, node);
    }

    // For Text nodes, it's simply the offset inside the text node
    // plus the length of all preceding text in the tree.
    return offset + getOffsetOfNode(root, node);
}

/**
 * helper to get the text length of all preceding siblings and parents' preceding siblings.
 */
function getOffsetOfNode(root: HTMLElement, node: Node): number {
    let total = 0;
    let current: Node | null = node;

    // Traverse up to the root
    while (current && current !== root) {
        if (current.previousSibling) {
            current = current.previousSibling;
            total += current.textContent?.length || 0;
        } else {
            current = current.parentNode;
        }
    }

    return total;
}
