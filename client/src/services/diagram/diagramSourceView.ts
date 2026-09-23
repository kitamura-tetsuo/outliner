// Projection of a Diagram's canonical source onto its rendered source view
// (issue #5311, REQ-004/REQ-007).
//
// Every offset here is a canonical Y.Text offset: a JavaScript string index,
// i.e. a UTF-16 code unit count. Y.Text measures content with `string.length`,
// so rendering must slice the source with the same unit. Iterating code points
// (`Array.from`) would give "😀a" two positions instead of the three canonical
// offsets 0, 2 and 3, painting a caret at offset 2 after the wrong glyph.

/** A caret painted at a canonical source offset. */
export interface SourceCaretMark {
    key: string;
    offset: number;
}

/** A source-internal selection, as a half-open canonical interval. */
export interface SourceRangeMark {
    start: number;
    end: number;
}

/** Ephemeral composition candidate shown at a canonical offset (REQ-013). */
export interface SourcePreeditMark {
    offset: number;
    text: string;
}

export type SourceSegment =
    | { kind: "text"; key: string; start: number; end: number; text: string; selected: boolean; }
    | { kind: "caret"; key: string; offset: number; }
    | { kind: "preedit"; key: string; offset: number; text: string; };

/** Clamp an offset into the source and off the inside of a surrogate pair. */
export function snapSourceOffset(source: string, offset: number): number {
    const clamped = Math.max(0, Math.min(Math.trunc(offset), source.length));
    return isInsideSurrogatePair(source, clamped) ? clamped - 1 : clamped;
}

/** True when `offset` falls between the two code units of one supplementary character. */
export function isInsideSurrogatePair(source: string, offset: number): boolean {
    if (offset <= 0 || offset >= source.length) return false;
    const before = source.charCodeAt(offset - 1);
    const after = source.charCodeAt(offset);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** The canonical offset one character (code point) before `offset`. */
export function previousCharacterOffset(source: string, offset: number): number {
    if (offset <= 0) return 0;
    return isInsideSurrogatePair(source, offset - 1) ? offset - 2 : offset - 1;
}

/** The canonical offset one character (code point) after `offset`. */
export function nextCharacterOffset(source: string, offset: number): number {
    if (offset >= source.length) return source.length;
    return isInsideSurrogatePair(source, offset + 1) ? offset + 2 : offset + 1;
}

/**
 * Split `source` into rendered runs at every caret, selection boundary and
 * preedit position. Text runs carry the canonical interval they display, so
 * the DOM text content between any two runs is exactly `source.slice(...)`.
 */
export function buildSourceSegments(
    source: string,
    carets: readonly SourceCaretMark[],
    ranges: readonly SourceRangeMark[],
    preedits: readonly SourcePreeditMark[] = [],
): SourceSegment[] {
    const normalizedRanges = ranges
        .map(range => {
            const a = snapSourceOffset(source, range.start);
            const b = snapSourceOffset(source, range.end);
            return { start: Math.min(a, b), end: Math.max(a, b) };
        })
        .filter(range => range.end > range.start);

    const boundaries = new Set<number>([0, source.length]);
    for (const caret of carets) boundaries.add(snapSourceOffset(source, caret.offset));
    for (const preedit of preedits) boundaries.add(snapSourceOffset(source, preedit.offset));
    for (const range of normalizedRanges) {
        boundaries.add(range.start);
        boundaries.add(range.end);
    }
    const points = [...boundaries].sort((a, b) => a - b);

    const segments: SourceSegment[] = [];
    const markersAt = (offset: number) => {
        preedits.forEach((preedit, index) => {
            if (snapSourceOffset(source, preedit.offset) === offset && preedit.text) {
                segments.push({ kind: "preedit", key: `preedit:${index}`, offset, text: preedit.text });
            }
        });
        for (const caret of carets) {
            if (snapSourceOffset(source, caret.offset) === offset) {
                segments.push({ kind: "caret", key: `caret:${caret.key}`, offset });
            }
        }
    };

    for (let i = 0; i < points.length; i++) {
        const start = points[i];
        markersAt(start);
        const end = points[i + 1];
        if (end === undefined || end <= start) continue;
        segments.push({
            kind: "text",
            key: `text:${start}`,
            start,
            end,
            text: source.slice(start, end),
            selected: normalizedRanges.some(range => range.start <= start && end <= range.end),
        });
    }
    return segments;
}
