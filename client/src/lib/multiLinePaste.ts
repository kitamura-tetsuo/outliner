export interface MultiLinePasteSplice {
    firstText: string;
    siblingTexts: string[];
    cursorOffset: number;
}

/**
 * Splices clipboard lines into an item's text without losing either side of
 * the caret. A single terminal newline is treated as a clipboard line ending,
 * rather than as a request to create an additional empty item.
 */
export function spliceMultiLinePaste(
    text: string,
    offset: number,
    clipboardLines: string[],
): MultiLinePasteSplice {
    const lines = clipboardLines.length > 1 && clipboardLines.at(-1) === ""
        ? clipboardLines.slice(0, -1)
        : clipboardLines;
    const normalizedLines = lines.length > 0 ? lines : [""];
    const safeOffset = Math.max(0, Math.min(offset, text.length));
    const head = text.substring(0, safeOffset);
    const tail = text.substring(safeOffset);

    if (normalizedLines.length === 1) {
        return {
            firstText: head + normalizedLines[0] + tail,
            siblingTexts: [],
            cursorOffset: head.length + normalizedLines[0].length,
        };
    }

    const lastLine = normalizedLines.at(-1) ?? "";
    return {
        firstText: head + normalizedLines[0],
        siblingTexts: [
            ...normalizedLines.slice(1, -1),
            lastLine + tail,
        ],
        cursorOffset: lastLine.length,
    };
}
