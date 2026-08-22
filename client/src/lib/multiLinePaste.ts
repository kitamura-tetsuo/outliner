/** Two spaces, or one tab, per level of nesting. */
const SPACES_PER_LEVEL = 2;

export interface PasteLineLayout {
    /** Line texts, with the indentation that encoded their depth removed. */
    texts: string[];
    /** Depth of each line, relative to the shallowest one. */
    depths: number[];
    /**
     * True when the lines came from an in-app payload, where each line is one
     * copied item rather than a guess read off indentation. An empty line is
     * then a real item — a Grid, Calendar or Layout owns no outline text at all
     * (#5015) — so none of them may be trimmed away as a line ending.
     */
    exact?: boolean;
}

/**
 * The nesting level a line's indentation encodes, and how much of that
 * indentation was spent saying so. Whitespace past the last whole level is not
 * structure — a single leading space is part of the text, not half an indent —
 * so it stays on the line.
 */
function readIndent(line: string): { level: number; consumed: number; } {
    let width = 0;
    let index = 0;
    let consumed = 0;
    let level = 0;
    for (; index < line.length; index++) {
        const character = line[index];
        if (character === " ") width += 1;
        else if (character === "\t") width += SPACES_PER_LEVEL;
        else break;
        // Record the position at which each whole level completes, so partial
        // indentation past it is left alone.
        if (width % SPACES_PER_LEVEL === 0) {
            level = width / SPACES_PER_LEVEL;
            consumed = index + 1;
        }
    }
    return { level, consumed };
}

/**
 * Read the outline shape out of a run of plain clipboard lines.
 *
 * Indentation is the only structure plain text carries, and it is read with
 * the convention the demo seeder writes (`addLinesToPage` in
 * `server/src/demo-content.ts`): two spaces or one tab per level, and a line
 * may never be more than one level deeper than the line above it. Depths are
 * relative to the shallowest line, so a copied subtree pastes flush with
 * wherever it lands. A blank line keeps the depth of the line before it rather
 * than snapping back to the top level.
 */
export function derivePasteLineLayout(lines: readonly string[]): PasteLineLayout {
    const indents = lines.map(readIndent);
    const texts = lines.map((line, index) => line.slice(indents[index].consumed));
    const rawDepths = lines.map((_line, index) => texts[index].trim() === "" ? undefined : indents[index].level);
    const measured = rawDepths.filter((depth): depth is number => depth !== undefined);
    const shallowest = measured.length > 0 ? Math.min(...measured) : 0;

    const depths: number[] = [];
    let previous = -1;
    for (const rawDepth of rawDepths) {
        if (rawDepth === undefined) {
            depths.push(Math.max(previous, 0));
            continue;
        }
        const depth = Math.min(Math.max(rawDepth - shallowest, 0), previous + 1);
        depths.push(depth);
        previous = depth;
    }
    return { texts, depths };
}

export interface MultiLinePasteSplice {
    firstText: string;
    siblingTexts: string[];
    cursorOffset: number;
    /** The text after the caret, when `detachTail` kept it off the last line. */
    detachedTail?: string;
}

export interface MultiLinePasteOptions {
    /**
     * Every line is one copied item, so a trailing empty line is content rather
     * than a line ending. Set for an in-app payload (`PasteLineLayout.exact`),
     * where trimming would drop an item and misalign the run with its metadata.
     */
    exactLines?: boolean;
    /**
     * Keep the text after the caret off the last pasted line and return it as
     * `detachedTail`. The caller sets this when that line is a visual node,
     * which owns no outline text to carry it (#5015).
     */
    detachTail?: boolean;
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
    options: MultiLinePasteOptions = {},
): MultiLinePasteSplice {
    const lines = !options.exactLines && clipboardLines.length > 1 && clipboardLines.at(-1) === ""
        ? clipboardLines.slice(0, -1)
        : clipboardLines;
    const normalizedLines = lines.length > 0 ? lines : [""];
    const safeOffset = Math.max(0, Math.min(offset, text.length));
    const head = text.substring(0, safeOffset);
    const tail = text.substring(safeOffset);

    const detachedTail = options.detachTail ? tail : undefined;
    const carriedTail = options.detachTail ? "" : tail;

    if (normalizedLines.length === 1) {
        return {
            firstText: head + normalizedLines[0] + carriedTail,
            siblingTexts: [],
            cursorOffset: head.length + normalizedLines[0].length,
            detachedTail,
        };
    }

    const lastLine = normalizedLines.at(-1) ?? "";
    return {
        firstText: head + normalizedLines[0],
        siblingTexts: [
            ...normalizedLines.slice(1, -1),
            lastLine + carriedTail,
        ],
        cursorOffset: lastLine.length,
        detachedTail,
    };
}
