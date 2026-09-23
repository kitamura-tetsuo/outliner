// Routing of native input commands that involve Diagram source (issue #5311).
//
// The shared hidden input bridge (GlobalTextArea → KeyEventHandler) delivers
// every keystroke, input event and paste. When the local cursor set contains a
// cursor on a Diagram occurrence, a mutating command is handled here as one
// command: every precondition is checked up front, Text recipients run their
// existing per-cursor editing path, Diagram recipients get one normalized edit
// per source, and the whole command becomes one history step. Commands with no
// Diagram participant never reach this module, so Text-only editing is
// unchanged (REQ-011).

import type { Cursor } from "../../lib/Cursor";
import { searchItem } from "../../lib/cursor/CursorNavigationUtils";
import { selectionHasRange } from "../../lib/cursor/CursorSelectionUtils";
import type { Item } from "../../schema/app-schema";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import {
    applyDiagramEdit,
    type DiagramCursorTarget,
    diagramTargetOf,
    isOnDiagramOccurrence,
    preflightDiagramCommand,
    type SourceEdit,
} from "./diagramCommand";
import { refuseCrossOwnerDiagramRange } from "./diagramEditing";

function involvesDiagram(cursors: readonly Cursor[]): boolean {
    return cursors.some(isOnDiagramOccurrence);
}

/**
 * User-level local ranges (not owned by one Diagram cursor) decide who handles a
 * destructive command. A character range joining Diagram source with another
 * owner is refused before any mutation (REQ-008); any other such range — Text
 * only, or a structural selection of whole nodes — keeps its existing handling.
 */
function userRangeDisposition(): "none" | "refused" | "existing" {
    const ranges = Object.values(editorOverlayStore.selections).filter(selection =>
        (selection.userId ?? "local") === "local" && !selection.cursorId && selectionHasRange(selection)
    );
    if (ranges.length === 0) return "none";
    const root = generalStore.currentPage as unknown as Item | undefined;
    for (const selection of ranges) {
        const refused = root && refuseCrossOwnerDiagramRange(
            { item: searchItem(root, selection.start.itemId), character: selection.start.kind === "text" },
            { item: searchItem(root, selection.end.itemId), character: selection.end.kind === "text" },
        );
        if (refused) return "refused";
    }
    return "existing";
}

function runDiagramCommand(cursors: readonly Cursor[], edit: SourceEdit, applyToText: (cursor: Cursor) => void) {
    if (!preflightDiagramCommand(cursors)) return;
    const diagrams: DiagramCursorTarget[] = [];
    const texts: Cursor[] = [];
    for (const cursor of cursors) {
        const target = diagramTargetOf(cursor);
        if (target) diagrams.push(target);
        else texts.push(cursor);
    }
    globalUndoRouter.captureCommand(() => {
        for (const cursor of texts) applyToText(cursor);
        applyDiagramEdit(diagrams, edit);
    });
    editorOverlayStore.syncTextareaToActiveItem();
    editorOverlayStore.startCursorBlink();
}

/** Keyboard commands that mutate Diagram source. Returns true when handled. */
export function handleDiagramKeyDown(event: KeyboardEvent, cursors: readonly Cursor[]): boolean {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (!involvesDiagram(cursors)) return false;
    let edit: SourceEdit;
    switch (event.key) {
        case "Backspace":
            edit = { kind: "deleteBackward" };
            break;
        case "Delete":
            edit = { kind: "deleteForward" };
            break;
        case "Enter":
            // A literal newline: never a new outline item (REQ-007).
            edit = { kind: "insert", text: "\n" };
            break;
        case "Tab":
            if (event.shiftKey) return false;
            edit = { kind: "insert", text: "\t" };
            break;
        default:
            return false;
    }
    const disposition = userRangeDisposition();
    if (disposition === "existing") return false;
    if (disposition === "none") runDiagramCommand(cursors, edit, cursor => cursor.onKeyDown(event));
    return true;
}

/** `input` events that mutate Diagram source. Returns true when handled. */
export function handleDiagramInput(event: InputEvent, cursors: readonly Cursor[]): boolean {
    if (event.isComposing || event.inputType.startsWith("insertComposition")) return false;
    if (!involvesDiagram(cursors)) return false;
    const type = event.inputType;
    let edit: SourceEdit | undefined;
    if (type === "deleteContentBackward" || type === "deleteWordBackward" || type === "deleteByCut") {
        edit = { kind: "deleteBackward" };
    } else if (type === "deleteContentForward" || type === "deleteWordForward") {
        edit = { kind: "deleteForward" };
    } else if (type === "insertLineBreak" || type === "insertParagraph") {
        edit = { kind: "insert", text: "\n" };
    } else if (type.startsWith("insertFrom")) {
        // Paste/drop arrive through the clipboard path.
        return false;
    } else if (event.data) {
        edit = { kind: "insert", text: event.data };
    }
    if (!edit) return true;
    const disposition = userRangeDisposition();
    if (disposition === "existing") return false;
    if (disposition === "none") runDiagramCommand(cursors, edit, cursor => cursor.onInput(event));
    return true;
}

/** Plain-text paste into Diagram source: ordinary literal text editing. */
export function handleDiagramPaste(text: string, cursors: readonly Cursor[]): boolean {
    if (!involvesDiagram(cursors)) return false;
    const disposition = userRangeDisposition();
    if (disposition === "existing") return false;
    if (disposition === "refused") return true;
    // A Text recipient of a mixed paste keeps the outline invariant that items hold no newlines.
    const singleLine = text.replace(/\r?\n/g, " ");
    if (text) runDiagramCommand(cursors, { kind: "insert", text }, cursor => cursor.insertText(singleLine));
    return true;
}
