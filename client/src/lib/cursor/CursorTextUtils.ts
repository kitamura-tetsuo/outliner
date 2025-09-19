export interface VisualLineSegment {
    startOffset: number;
    endOffset: number;
    y: number;
}

export interface VisualLineInfo {
    lineIndex: number;
    lineStartOffset: number;
    lineEndOffset: number;
    totalLines: number;
    lines: VisualLineSegment[];
}

/**
 * Count the number of logical lines in a text block.
 */
export function countLines(text: string): number {
    return text.split("\n").length;
}

/**
 * Return the offset of the first character on the given line.
 * The behaviour intentionally matches the legacy Cursor implementation
 * which keeps iterating even when lineIndex exceeds the line count.
 */
export function getLineStartOffset(text: string, lineIndex: number): number {
    const lines = text.split("\n");
    let offset = 0;
    for (let i = 0; i < lineIndex; i++) {
        if (i < lines.length) {
            offset += lines[i].length + 1; // include newline
        }
    }
    return offset;
}

/**
 * Return the offset just after the last character on the given line.
 */
export function getLineEndOffset(text: string, lineIndex: number): number {
    const lines = text.split("\n");
    if (lineIndex >= lines.length) {
        return text.length;
    }

    let offset = 0;
    for (let i = 0; i < lineIndex; i++) {
        offset += lines[i].length + 1; // include newline
    }
    return offset + lines[lineIndex].length;
}

/**
 * Resolve the logical line index for the provided offset.
 */
export function getCurrentLineIndex(text: string, offset: number): number {
    if (!text) return 0;

    const lines = text.split("\n");
    if (offset >= text.length) {
        return lines.length - 1;
    }

    let currentOffset = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length;
        if (offset < currentOffset + lineLength) {
            return i;
        }

        currentOffset += lineLength;
        if (i < lines.length - 1) {
            currentOffset += 1; // newline
        }

        if (offset === currentOffset && i < lines.length - 1) {
            return i + 1;
        }
    }

    return lines.length - 1;
}

/**
 * Convert an offset into a zero-based column value.
 */
export function getCurrentColumn(text: string, offset: number): number {
    const lineIndex = getCurrentLineIndex(text, offset);
    return offset - getLineStartOffset(text, lineIndex);
}

/**
 * Inspect the DOM and return visual line information for the item.
 */
export function getVisualLineInfo(itemId: string, offset: number): VisualLineInfo | null {
    if (typeof window === "undefined") return null;

    const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
    if (!itemElement) return null;

    const textElement = itemElement.querySelector(".item-text") as HTMLElement | null;
    if (!textElement) return null;

    const text = textElement.textContent ?? "";
    if (text.length === 0) {
        return {
            lineIndex: 0,
            lineStartOffset: 0,
            lineEndOffset: 0,
            totalLines: 1,
            lines: [{ startOffset: 0, endOffset: 0, y: 0 }],
        };
    }

    const textNode = Array.from(textElement.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as
        | Text
        | undefined;
    if (!textNode) return null;

    try {
        const segments: VisualLineSegment[] = [];
        let currentLineY: number | null = null;
        let currentLineStart = 0;

        const maxOffset = textNode.textContent?.length ?? text.length;

        for (let i = 0; i <= text.length; i += 1) {
            const actualOffset = Math.min(i, text.length);
            const range = document.createRange();
            const safeOffset = Math.min(actualOffset, maxOffset);
            range.setStart(textNode, safeOffset);
            range.setEnd(textNode, safeOffset);

            const rect = range.getBoundingClientRect();
            const y = Math.round(rect.top);

            if (currentLineY === null) {
                currentLineY = y;
            } else if (Math.abs(y - currentLineY) > 2) {
                segments.push({
                    startOffset: currentLineStart,
                    endOffset: Math.max(currentLineStart, actualOffset - 1),
                    y: currentLineY,
                });
                currentLineStart = actualOffset;
                currentLineY = y;
            }
        }

        if (currentLineY !== null) {
            segments.push({ startOffset: currentLineStart, endOffset: text.length, y: currentLineY });
        }

        if (segments.length === 0) {
            segments.push({
                startOffset: 0,
                endOffset: text.length,
                y: textElement.getBoundingClientRect().top,
            });
        }

        let currentLineIndex = 0;
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            if (offset >= segment.startOffset && offset <= segment.endOffset) {
                currentLineIndex = i;
                break;
            }
        }

        if (currentLineIndex >= segments.length) {
            currentLineIndex = segments.length - 1;
        }

        const currentLine = segments[currentLineIndex];
        return {
            lineIndex: currentLineIndex,
            lineStartOffset: currentLine.startOffset,
            lineEndOffset: currentLine.endOffset,
            totalLines: segments.length,
            lines: segments,
        };
    } catch (error) {
        console.error("Error getting visual line info:", error);
        return null;
    }
}

/**
 * Return the offset range for a specific visual line.
 */
export function getVisualLineOffsetRange(
    itemId: string,
    lineIndex: number,
): { startOffset: number; endOffset: number; } | null {
    const visualInfo = getVisualLineInfo(itemId, 0);
    if (!visualInfo || lineIndex < 0 || lineIndex >= visualInfo.totalLines) {
        return null;
    }

    const { startOffset, endOffset } = visualInfo.lines[lineIndex];
    return { startOffset, endOffset };
}
