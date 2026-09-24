// Cross-client Diagram source cursor presence (issue #5312).
//
// A Diagram cursor is addressed by (diagramId, cursorId), never by the
// occurrence/page it was placed through (REQ-002/REQ-003): two clients can
// view the same project-owned Diagram through different occurrences on
// different pages, or the same Diagram may have no occurrence at all on a
// receiver's current page. Its position rides as a Yjs relative position
// anchored to the Diagram's collaborative Y.Text, so a receiver resolves it
// against its own, possibly concurrently edited, replica rather than
// trusting a numeric offset that may already be stale by the time it
// arrives (REQ-005). See https://docs.yjs.dev/api/relative-positions.

import type { Project } from "$shared/app-schema";
import * as Y from "yjs";
import { getDiagramSourceYText } from "./diagramService";

type RelativePositionJSON = ReturnType<typeof Y.relativePositionToJSON>;

export interface DiagramCursorSelectionWire {
    anchor: RelativePositionJSON;
    head: RelativePositionJSON;
}

/** What one local logical cursor targeting a Diagram source puts on the wire. */
export interface DiagramCursorWire {
    diagramId: string;
    cursorId: string;
    position: RelativePositionJSON;
    selection?: DiagramCursorSelectionWire;
}

export interface ResolvedDiagramCursor {
    offset: number;
    selection?: { start: number; end: number; };
}

function relativePositionAt(source: Y.Text, offset: number): Y.RelativePosition {
    const safe = Math.max(0, Math.min(Math.trunc(offset), source.length));
    // Associate with the character to the left, matching Cursor.ts's own local
    // caret anchor (bindCaretAnchor): an insertion exactly at this position —
    // ours or a peer's — advances the anchor rather than splitting it.
    return Y.createRelativePositionFromTypeIndex(source, safe, -1);
}

/**
 * Encode one local Diagram cursor for the wire. Returns undefined only when
 * `source` is not (yet) part of a document — never for an out-of-range
 * offset, which is clamped instead.
 */
export function encodeDiagramCursor(
    diagramId: string,
    cursorId: string,
    source: Y.Text,
    offset: number,
    selection?: { start: number; end: number; isReversed?: boolean; },
): DiagramCursorWire | undefined {
    if (!source.doc) return undefined;
    const position = Y.relativePositionToJSON(relativePositionAt(source, offset));

    let selectionWire: DiagramCursorSelectionWire | undefined;
    if (selection && selection.start !== selection.end) {
        const anchorOffset = selection.isReversed ? selection.end : selection.start;
        const headOffset = selection.isReversed ? selection.start : selection.end;
        selectionWire = {
            anchor: Y.relativePositionToJSON(relativePositionAt(source, anchorOffset)),
            head: Y.relativePositionToJSON(relativePositionAt(source, headOffset)),
        };
    }

    return { diagramId, cursorId, position, selection: selectionWire };
}

function parseRelativePositionJSON(value: unknown): Y.RelativePosition | undefined {
    if (!value || typeof value !== "object") return undefined;
    try {
        return Y.createRelativePositionFromJSON(value as RelativePositionJSON);
    } catch {
        return undefined;
    }
}

/**
 * Resolve one wire cursor against the current project doc. Returns undefined
 * — "pending" — when the Diagram/source is not yet loaded locally, or the
 * position cannot (yet) be resolved against it; callers must keep such a
 * record around rather than fabricating an offset (REQ-005), and retry once
 * more source/text evidence becomes available.
 */
export function resolveDiagramCursor(project: Project, wire: DiagramCursorWire): ResolvedDiagramCursor | undefined {
    const source = getDiagramSourceYText(project, wire.diagramId);
    if (!source || !source.doc) return undefined;

    const relPos = parseRelativePositionJSON(wire.position);
    if (!relPos) return undefined;
    const abs = Y.createAbsolutePositionFromRelativePosition(relPos, project.ydoc);
    if (!abs || abs.type !== source) return undefined;
    const offset = abs.index;

    let selection: { start: number; end: number; } | undefined;
    if (wire.selection) {
        const anchorRel = parseRelativePositionJSON(wire.selection.anchor);
        const headRel = parseRelativePositionJSON(wire.selection.head);
        const anchorAbs = anchorRel && Y.createAbsolutePositionFromRelativePosition(anchorRel, project.ydoc);
        const headAbs = headRel && Y.createAbsolutePositionFromRelativePosition(headRel, project.ydoc);
        if (anchorAbs && headAbs && anchorAbs.type === source && headAbs.type === source) {
            selection = {
                start: Math.min(anchorAbs.index, headAbs.index),
                end: Math.max(anchorAbs.index, headAbs.index),
            };
        }
    }

    return { offset, selection };
}

/**
 * Validate an untrusted wire payload before it enters local state: a peer's
 * own build sent whatever shape it sent, so nothing here is trusted, and a
 * record this build cannot read is dropped rather than guessed at.
 */
export function parseDiagramCursorsWire(raw: unknown): DiagramCursorWire[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: DiagramCursorWire[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const { diagramId, cursorId, position, selection } = entry as Record<string, unknown>;
        if (typeof diagramId !== "string" || !diagramId) continue;
        if (typeof cursorId !== "string" || !cursorId) continue;
        if (!position || typeof position !== "object") continue;

        let selectionWire: DiagramCursorSelectionWire | undefined;
        if (selection && typeof selection === "object") {
            const { anchor, head } = selection as Record<string, unknown>;
            if (anchor && typeof anchor === "object" && head && typeof head === "object") {
                selectionWire = {
                    anchor: anchor as RelativePositionJSON,
                    head: head as RelativePositionJSON,
                };
            }
        }

        out.push({ diagramId, cursorId, position: position as RelativePositionJSON, selection: selectionWire });
    }
    return out;
}
