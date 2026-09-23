// One native editing command over Diagram source (issue #5311, REQ-006/008/010).
//
// Several local logical cursors may target the same Diagram source — distinct
// cursors added by the user, or cursors placed through different occurrences
// of the same Diagram. Reflections are painting only; the logical recipients of
// a command are the real local cursors. Per Diagram, their edit sites are
// normalized before anything is written: coincident insertion points collapse
// into one, and duplicate or overlapping ranges are unioned, so each distinct
// logical edit is applied exactly once and replacement text is inserted once at
// the start of each union.

import type { Project } from "$shared/app-schema";
import type * as Y from "yjs";
import type { Cursor } from "../../lib/Cursor";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { invokingSurfaceWritable } from "../editorSurface";
import {
    canEditDiagramOccurrence,
    DIAGRAM_SOURCE_EDIT_ORIGIN,
    diagramIdForItem,
    isDiagramItem,
    reportDiagramEditRefusal,
} from "./diagramEditing";
import { nextCharacterOffset, previousCharacterOffset, snapSourceOffset } from "./diagramSourceView";

/** A half-open canonical interval of a Diagram source. */
export interface SourceInterval {
    start: number;
    end: number;
}

/** What one local cursor contributes to a command on a Diagram source. */
export interface DiagramCursorTarget {
    cursor: Cursor;
    project: Project;
    /** The occurrence the cursor was placed through: navigation anchor only. */
    occurrenceId: string;
    diagramId: string;
    source: Y.Text;
}

/** Resolve the Diagram source a local cursor edits, if it targets one. */
export function diagramTargetOf(cursor: Cursor): DiagramCursorTarget | undefined {
    const project = generalStore.project;
    if (!project) return undefined;
    const target = cursor.findTarget();
    if (!target || !isDiagramItem(target)) return undefined;
    const diagramId = diagramIdForItem(target);
    const source: unknown = target.text;
    if (!diagramId || !source || typeof (source as Y.Text).insert !== "function") return undefined;
    return { cursor, project, occurrenceId: target.id, diagramId, source: source as Y.Text };
}

/**
 * Whether a cursor is placed on a Diagram occurrence, resolvable or not.
 * Lightweight cursor stand-ins without the method never are.
 */
export function isOnDiagramOccurrence(cursor: Cursor): boolean {
    return typeof cursor.isOnDiagramOccurrence === "function" && cursor.isOnDiagramOccurrence();
}

/** The source-internal range owned by a cursor, if it has a non-empty one. */
export function cursorSourceRange(target: DiagramCursorTarget): SourceInterval | undefined {
    const selection = editorOverlayStore.getCursorSelection(target.cursor.cursorId);
    if (!selection || selection.start.kind !== "text" || selection.end.kind !== "text") return undefined;
    if (selection.start.itemId !== target.occurrenceId || selection.end.itemId !== target.occurrenceId) {
        return undefined;
    }
    const text = target.source.toString();
    const a = snapSourceOffset(text, selection.start.offset);
    const b = snapSourceOffset(text, selection.end.offset);
    return a === b ? undefined : { start: Math.min(a, b), end: Math.max(a, b) };
}

/**
 * Union the edit sites of one command. Sites are sorted, then merged when they
 * overlap, are identical, or when a collapsed site touches another site: a
 * point at a range boundary lands on the same position once the range is
 * replaced. Two non-empty ranges that only touch stay distinct edits.
 */
export function normalizeSourceIntervals(sites: readonly SourceInterval[]): SourceInterval[] {
    const sorted = sites
        .map(site => ({ start: Math.min(site.start, site.end), end: Math.max(site.start, site.end) }))
        .sort((a, b) => a.start - b.start || a.end - b.end);
    const unions: SourceInterval[] = [];
    for (const site of sorted) {
        const last = unions[unions.length - 1];
        const collapsed = site.start === site.end || (last !== undefined && last.start === last.end);
        if (last && (site.start < last.end || (collapsed && site.start <= last.end))) {
            last.end = Math.max(last.end, site.end);
        } else {
            unions.push({ ...site });
        }
    }
    return unions;
}

export type SourceEdit =
    | { kind: "insert"; text: string; }
    | { kind: "deleteBackward"; }
    | { kind: "deleteForward"; };

/** The site a cursor edits for `edit`, or undefined when it edits nothing. */
function editSite(target: DiagramCursorTarget, edit: SourceEdit): SourceInterval | undefined {
    const range = cursorSourceRange(target);
    if (range) return range;
    const text = target.source.toString();
    const offset = snapSourceOffset(text, target.cursor.offset);
    if (edit.kind === "insert") return { start: offset, end: offset };
    // Backspace at the source start / Delete at its end stays inside the source:
    // it never merges with neighboring Text or removes the occurrence (REQ-007).
    if (edit.kind === "deleteBackward") {
        return offset === 0 ? undefined : { start: previousCharacterOffset(text, offset), end: offset };
    }
    return offset === text.length ? undefined : { start: offset, end: nextCharacterOffset(text, offset) };
}

/**
 * Check every mutation precondition of a command before anything is written
 * (REQ-010): each Diagram recipient must be resolvable and currently editable
 * through its invoking occurrence, and when a Diagram participates every Text
 * recipient's surface must be writable too. A refusal covers the whole command:
 * no participating target may receive a partial edit.
 */
export function preflightDiagramCommand(cursors: readonly Cursor[]): boolean {
    const onDiagram = cursors.filter(isOnDiagramOccurrence);
    if (onDiagram.length === 0) return true;
    for (const cursor of onDiagram) {
        const target = diagramTargetOf(cursor);
        if (!target) {
            reportDiagramEditRefusal({ itemId: cursor.itemId, reason: "unavailable" });
            return false;
        }
        if (!canEditDiagramOccurrence(target.project, target.occurrenceId)) {
            reportDiagramEditRefusal({ itemId: target.occurrenceId, reason: "unauthorized" });
            return false;
        }
    }
    if (onDiagram.length < cursors.length && !invokingSurfaceWritable()) {
        reportDiagramEditRefusal({ reason: "unauthorized" });
        return false;
    }
    return true;
}

/**
 * Apply one normalized edit to every Diagram source targeted by `targets`, in
 * one transaction per Diagram, and move each participating cursor to the end of
 * the union it contributed to. Callers run `preflightDiagramCommand` first.
 */
export function applyDiagramEdit(
    targets: readonly DiagramCursorTarget[],
    edit: SourceEdit,
    /** Sites already resolved by the caller (a composition's captured anchors), by cursor id. */
    resolvedSites?: ReadonlyMap<string, SourceInterval>,
): void {
    const byDiagram = new Map<string, DiagramCursorTarget[]>();
    for (const target of targets) {
        const list = byDiagram.get(target.diagramId) ?? [];
        list.push(target);
        byDiagram.set(target.diagramId, list);
    }
    const insertText = edit.kind === "insert" ? edit.text : "";

    for (const group of byDiagram.values()) {
        const { project, source } = group[0];
        const participants = group
            .map(target => ({ target, site: resolvedSites?.get(target.cursor.cursorId) ?? editSite(target, edit) }))
            .filter((entry): entry is { target: DiagramCursorTarget; site: SourceInterval; } => !!entry.site);
        if (participants.length === 0) continue;
        const unions = normalizeSourceIntervals(participants.map(entry => entry.site));
        if (!insertText && unions.every(union => union.start === union.end)) continue;

        project.ydoc.transact(() => {
            for (const union of unions.toReversed()) {
                if (union.end > union.start) source.delete(union.start, union.end - union.start);
                if (insertText) source.insert(union.start, insertText);
            }
        }, DIAGRAM_SOURCE_EDIT_ORIGIN);

        // Final caret of each union, shifted by every earlier union's net change.
        let shift = 0;
        const finalOffsets = unions.map(union => {
            const offset = union.start + shift + insertText.length;
            shift += insertText.length - (union.end - union.start);
            return offset;
        });
        for (const { target, site } of participants) {
            const index = unions.findIndex(union => site.start >= union.start && site.end <= union.end);
            editorOverlayStore.setCursorSelection(target.cursor.cursorId, undefined);
            target.cursor.offset = finalOffsets[Math.max(0, index)];
            target.cursor.applyToStore();
        }
    }
}
