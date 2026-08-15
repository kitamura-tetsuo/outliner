/** Two spaces, or one tab, per level of nesting. */
const SPACES_PER_LEVEL = 2;

export interface PasteLineLayout {
    /** Line texts, with the indentation that encoded their depth removed. */
    texts: string[];
    /** Depth of each line, relative to the shallowest one. */
    depths: number[];
}

function indentLevel(line: string): number {
    let width = 0;
    for (const character of line) {
        if (character === " ") width += 1;
        else if (character === "\t") width += SPACES_PER_LEVEL;
        else break;
    }
    return Math.floor(width / SPACES_PER_LEVEL);
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
    const texts = lines.map(line => line.replace(/^[ \t]+/, ""));
    const rawDepths = lines.map((line, index) => texts[index] === "" ? undefined : indentLevel(line));
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
