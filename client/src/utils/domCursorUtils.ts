/**
 * Utility functions for mapping DOM positions to raw text offsets in OutlinerItem.
 * This optimizes cursor positioning performance by avoiding expensive fallback logic.
 */

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
