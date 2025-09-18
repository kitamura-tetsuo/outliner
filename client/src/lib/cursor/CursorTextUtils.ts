// @ts-nocheck
import type { Item } from "../../schema/yjs-schema";

/**
 * Count the number of lines in a text string
 */
export function countLines(text: string): number {
    return text.split("\n").length;
}

/**
 * Get the start offset of a specific line
 */
export function getLineStartOffset(text: string, lineIndex: number): number {
    const lines = text.split("\n");
    let offset = 0;
    for (let i = 0; i < lineIndex; i++) {
        if (i < lines.length) {
            offset += lines[i].length + 1; // +1 for newline character
        }
    }
    return offset;
}

/**
 * Get the end offset of a specific line (excluding newline character)
 */
export function getLineEndOffset(text: string, lineIndex: number): number {
    const lines = text.split("\n");
    if (lineIndex >= lines.length) {
        return text.length;
    }

    let offset = 0;
    for (let i = 0; i < lineIndex; i++) {
        offset += lines[i].length + 1; // +1 for newline character
    }
    // Add the length of the target line (without newline)
    offset += lines[lineIndex].length;
    return offset;
}

/**
 * Get the current line index for a given offset
 */
export function getCurrentLineIndex(text: string, offset: number): number {
    // Return 0 for empty text
    if (!text) return 0;

    const lines = text.split("\n");

    // If offset exceeds text length, return the last line
    if (offset >= text.length) {
        return lines.length - 1;
    }

    let currentOffset = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;

        // If offset is within the current line
        if (offset < currentOffset + lineLength) {
            return i;
        }

        // Move to the next line (including newline character)
        currentOffset += lineLength;
        if (i < lines.length - 1) {
            currentOffset += 1; // For newline character
        }

        // If offset is at the newline character, move to the next line
        if (offset === currentOffset && i < lines.length - 1) {
            return i + 1;
        }
    }

    // Default to the last line
    return lines.length - 1;
}

/**
 * Get the current column position for a given offset
 */
export function getCurrentColumn(text: string, offset: number): number {
    const lineIndex = getCurrentLineIndex(text, offset);
    const lineStartOffset = getLineStartOffset(text, lineIndex);
    return offset - lineStartOffset;
}

/**
 * Get visual line information using the Range API
 */
export function getVisualLineInfo(
    itemId: string,
    offset: number,
): {
    lineIndex: number;
    lineStartOffset: number;
    lineEndOffset: number;
    totalLines: number;
    lines: Array<{ startOffset: number; endOffset: number; y: number; }>;
} | null {
    if (typeof window === "undefined") return null;

    const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
    if (!itemElement) return null;

    const textElement = itemElement.querySelector(".item-text") as HTMLElement;
    if (!textElement) return null;

    const text = textElement.textContent || "";
    if (text.length === 0) {
        return {
            lineIndex: 0,
            lineStartOffset: 0,
            lineEndOffset: 0,
            totalLines: 1,
            lines: [{ startOffset: 0, endOffset: 0, y: 0 }],
        };
    }

    // Use Range API to determine visual lines
    const textNode = Array.from(textElement.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text;
    if (!textNode) return null;

    try {
        // Get Y coordinates for each character position to determine lines
        const lines: { startOffset: number; endOffset: number; y: number; }[] = [];
        let currentLineY: number | null = null;
        let currentLineStart = 0;

        // Sample every character to accurately detect line boundaries
        const step = 1;

        for (let i = 0; i <= text.length; i += step) {
            const actualOffset = Math.min(i, text.length);
            const range = document.createRange();
            const safeOffset = Math.min(actualOffset, textNode.textContent?.length || 0);
            range.setStart(textNode, safeOffset);
            range.setEnd(textNode, safeOffset);

            const rect = range.getBoundingClientRect();
            const y = Math.round(rect.top);

            if (currentLineY === null) {
                currentLineY = y;
            } else if (Math.abs(y - currentLineY) > 2) { // New line if Y difference exceeds threshold
                // New line started
                lines.push({
                    startOffset: currentLineStart,
                    endOffset: Math.max(currentLineStart, actualOffset - 1), // Ensure at least start offset
                    y: currentLineY,
                });
                currentLineStart = actualOffset;
                currentLineY = y;
            }
        }

        // Add the last line
        if (currentLineY !== null) {
            lines.push({
                startOffset: currentLineStart,
                endOffset: text.length,
                y: currentLineY,
            });
        }

        // If no lines detected, treat as single line
        if (lines.length === 0) {
            lines.push({
                startOffset: 0,
                endOffset: text.length,
                y: textElement.getBoundingClientRect().top,
            });
        }

        // Determine which line the current offset is on
        let currentLineIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (offset >= lines[i].startOffset && offset <= lines[i].endOffset) {
                currentLineIndex = i;
                break;
            }
        }

        // Clamp to valid range
        if (currentLineIndex >= lines.length) {
            currentLineIndex = lines.length - 1;
        }

        const currentLine = lines[currentLineIndex];
        return {
            lineIndex: currentLineIndex,
            lineStartOffset: currentLine.startOffset,
            lineEndOffset: currentLine.endOffset,
            totalLines: lines.length,
            lines: lines,
        };
    } catch (error) {
        console.error("Error getting visual line info:", error);
        return null;
    }
}

/**
 * Get the offset range for a specific visual line
 */
export function getVisualLineOffsetRange(
    itemId: string,
    lineIndex: number,
): { startOffset: number; endOffset: number; } | null {
    const visualInfo = getVisualLineInfo(itemId, 0); // Any offset works for line info
    if (!visualInfo || lineIndex < 0 || lineIndex >= visualInfo.totalLines) {
        return null;
    }

    const targetLine = visualInfo.lines[lineIndex];
    return {
        startOffset: targetLine.startOffset,
        endOffset: targetLine.endOffset,
    };
}
