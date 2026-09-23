// Diagram-involving IME composition sessions (issue #5311, REQ-009/013/014).
//
// A composition whose local cursor set includes a Diagram source target is
// session-bound. At compositionstart the session captures its recipients: each
// participating local cursor, the canonical owner it edits (a Diagram source or
// an ordinary Text item) and Yjs relative positions for its insertion point or
// selected range. Until completion the candidate stays ephemeral state of this
// session — rendered as inline preedit, never written to any owner and never an
// undo step. A valid completion resolves the captured anchors against their
// original owners (so intervening edits rebase them with Yjs' default
// right-associated semantics), normalizes Diagram ranges and commits the final
// candidate once as one command and one history step.
//
// Any explicit local change of the captured cursors, targets or selections, the
// unmounting of a participating active occurrence, loss of permission, or
// editing-session teardown cancels the session. Its later update/completion
// events are inert until the next native compositionstart; remounting the same
// ids or restoring access does not revive it. Text-only compositions keep their
// existing behavior and never create a session.

import type { Project } from "$shared/app-schema";
import * as Y from "yjs";
import type { Cursor } from "../../lib/Cursor";
import { onLocalCursorIntent, withoutLocalCursorIntent } from "../../lib/localCursorIntent";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import {
    applyDiagramEdit,
    cursorSourceRange,
    type DiagramCursorTarget,
    diagramTargetOf,
    isOnDiagramOccurrence,
    preflightDiagramCommand,
} from "./diagramCommand";
import { reportDiagramEditRefusal } from "./diagramEditing";

interface DiagramParticipant {
    kind: "diagram";
    cursorId: string;
    occurrenceId: string;
    diagramId: string;
    source: Y.Text;
    start: Y.RelativePosition;
    end: Y.RelativePosition;
}

interface TextParticipant {
    kind: "text";
    cursorId: string;
    itemId: string;
    text: Y.Text;
    start: Y.RelativePosition;
    end: Y.RelativePosition;
}

type Participant = DiagramParticipant | TextParticipant;

interface CompositionSession {
    generation: number;
    project: Project;
    participants: Participant[];
}

export type CompositionOutcome = "idle" | "composing" | "committed" | "cancelled" | "unavailable";

class DiagramCompositionState {
    /** The live session, if a Diagram-involving composition is pending. */
    session = $state.raw<CompositionSession | undefined>(undefined);
    /** Ephemeral candidate of the live session. */
    candidate = $state("");
    /** Observable result of the most recent session (REQ-014). */
    outcome = $state<CompositionOutcome>("idle");
    private generation = 0;
    /** Generation whose events are still accepted; anything else is stale. */
    private liveGeneration = -1;
    /** True from a Diagram-involving compositionstart until its end/cancel. */
    private ownsNativeComposition = false;

    constructor() {
        onLocalCursorIntent(() => {
            if (this.session) this.cancel("cancelled");
        });
        // Undo/Redo while a composition is pending cancels it first; the
        // cancellation itself is not a history step (REQ-009).
        globalUndoRouter.onBeforeHistory(() => {
            if (this.session) this.cancel("cancelled");
        });
    }

    /** True while native composition events belong to a Diagram-involving session. */
    get handlesCurrentComposition(): boolean {
        return this.ownsNativeComposition;
    }

    /** compositionstart: open a session when any local cursor targets a Diagram. */
    start(cursors: readonly Cursor[]): boolean {
        this.generation++;
        this.ownsNativeComposition = false;
        this.session = undefined;
        this.candidate = "";
        if (!cursors.some(isOnDiagramOccurrence)) return false;
        this.ownsNativeComposition = true;
        const project = generalStore.project;
        const participants: Participant[] = [];
        for (const cursor of cursors) {
            const participant = project ? this.capture(cursor) : undefined;
            if (!participant) {
                // A recipient that cannot be resolved makes the whole session unavailable.
                this.outcome = "unavailable";
                reportDiagramEditRefusal({ itemId: cursor.itemId, reason: "unavailable" });
                return true;
            }
            participants.push(participant);
        }
        this.session = { generation: this.generation, project: project!, participants };
        this.liveGeneration = this.generation;
        this.outcome = "composing";
        return true;
    }

    private capture(cursor: Cursor): Participant | undefined {
        const diagram = diagramTargetOf(cursor);
        if (diagram) {
            const range = cursorSourceRange(diagram) ?? { start: cursor.offset, end: cursor.offset };
            return {
                kind: "diagram",
                cursorId: cursor.cursorId,
                occurrenceId: diagram.occurrenceId,
                diagramId: diagram.diagramId,
                source: diagram.source,
                start: Y.createRelativePositionFromTypeIndex(diagram.source, range.start),
                end: Y.createRelativePositionFromTypeIndex(diagram.source, range.end),
            };
        }
        if (isOnDiagramOccurrence(cursor)) return undefined;
        const target = cursor.findTarget();
        const candidate: unknown = target?.text;
        const text = candidate instanceof Y.Text ? candidate : undefined;
        if (!target || !text) return undefined;
        const selection = editorOverlayStore.getItemCursorsAndSelections(target.id).selections.find(s =>
            (s.userId ?? "local") === "local" && s.start.kind === "text" && s.end.kind === "text"
            && s.start.itemId === target.id && s.end.itemId === target.id
        );
        const a = selection?.startOffset ?? cursor.offset;
        const b = selection?.endOffset ?? cursor.offset;
        return {
            kind: "text",
            cursorId: cursor.cursorId,
            itemId: target.id,
            text,
            start: Y.createRelativePositionFromTypeIndex(text, Math.min(a, b)),
            end: Y.createRelativePositionFromTypeIndex(text, Math.max(a, b)),
        };
    }

    /** compositionupdate: the candidate changes; nothing canonical does. */
    update(data: string): void {
        if (!this.session || this.session.generation !== this.liveGeneration) return;
        this.candidate = data;
    }

    /** compositionend: commit the final candidate once, or nothing if stale. */
    end(data: string): void {
        const session = this.session;
        this.ownsNativeComposition = false;
        if (!session || session.generation !== this.liveGeneration) return;
        this.liveGeneration = -1;
        this.session = undefined;
        this.candidate = "";
        if (!data) {
            // A cancelled (empty) composition deletes nothing, not even the selection.
            this.outcome = "cancelled";
            return;
        }
        const resolved = this.resolve(session);
        if (!resolved) {
            this.outcome = "unavailable";
            reportDiagramEditRefusal({ reason: "unavailable" });
            return;
        }
        if (!preflightDiagramCommand(resolved.cursors)) {
            this.outcome = "cancelled";
            return;
        }
        withoutLocalCursorIntent(() => {
            globalUndoRouter.captureCommand(() => {
                for (const text of resolved.texts) {
                    const item = text.cursor.findTarget();
                    if (!item) continue;
                    if (text.end > text.start) item.deleteTextAt(text.start, text.end - text.start);
                    item.insertTextAt(text.start, data);
                    text.cursor.offset = text.start + data.length;
                    text.cursor.applyToStore();
                }
                applyDiagramEdit(
                    resolved.diagrams.map(entry => entry.target),
                    { kind: "insert", text: data },
                    new Map(resolved.diagrams.map(entry => [entry.target.cursor.cursorId, entry])),
                );
            });
            editorOverlayStore.syncTextareaToActiveItem();
        });
        this.outcome = "committed";
    }

    /**
     * Resolve every captured anchor against its original owner. Any recipient
     * that no longer exists, no longer targets that owner, or whose endpoints no
     * longer form an ordered range invalidates the whole commit.
     */
    private resolve(session: CompositionSession) {
        const cursors: Cursor[] = [];
        const diagrams: Array<{ target: DiagramCursorTarget; start: number; end: number; }> = [];
        const texts: Array<{ cursor: Cursor; start: number; end: number; }> = [];
        for (const participant of session.participants) {
            const cursor = editorOverlayStore.cursorInstances.get(participant.cursorId);
            if (!cursor) return undefined;
            const owner = participant.kind === "diagram" ? participant.source : participant.text;
            const doc = owner.doc;
            if (!doc) return undefined;
            const start = Y.createAbsolutePositionFromRelativePosition(participant.start, doc);
            const end = Y.createAbsolutePositionFromRelativePosition(participant.end, doc);
            if (!start || !end || start.type !== owner || end.type !== owner || start.index > end.index) {
                return undefined;
            }
            if (participant.kind === "diagram") {
                const target = diagramTargetOf(cursor);
                if (
                    !target || target.diagramId !== participant.diagramId
                    || target.occurrenceId !== participant.occurrenceId || target.source !== participant.source
                ) {
                    return undefined;
                }
                diagrams.push({ target, start: start.index, end: end.index });
            } else {
                const target = cursor.findTarget();
                if (!target || target.id !== participant.itemId) return undefined;
                texts.push({ cursor, start: start.index, end: end.index });
            }
            cursors.push(cursor);
        }
        return { cursors, diagrams, texts };
    }

    /** Invalidate the live session; its later events stay inert. */
    cancel(outcome: "cancelled" | "unavailable" = "cancelled"): void {
        if (!this.session) return;
        this.session = undefined;
        this.candidate = "";
        this.liveGeneration = -1;
        this.outcome = outcome;
    }

    /** A participating active occurrence unmounted or lost write access. */
    occurrenceInvalidated(occurrenceId: string): void {
        const session = this.session;
        if (!session) return;
        if (session.participants.some(p => p.kind === "diagram" && p.occurrenceId === occurrenceId)) {
            this.cancel("unavailable");
        }
    }

    /**
     * Inline preedit to paint in every mounted occurrence of `diagramId`. Reads
     * only reactive session state; callers re-derive when the source changes.
     */
    preeditsFor(diagramId: string): Array<{ offset: number; text: string; }> {
        const session = this.session;
        if (!session || !this.candidate) return [];
        const marks: Array<{ offset: number; text: string; }> = [];
        for (const participant of session.participants) {
            if (participant.kind !== "diagram" || participant.diagramId !== diagramId) continue;
            const doc = participant.source.doc;
            const start = doc && Y.createAbsolutePositionFromRelativePosition(participant.start, doc);
            if (start && start.type === participant.source) marks.push({ offset: start.index, text: this.candidate });
        }
        return marks;
    }

    /** Original ranges hidden by the preedit, so the candidate reads in place. */
    replacedRangesFor(diagramId: string): Array<{ start: number; end: number; }> {
        const session = this.session;
        if (!session) return [];
        const ranges: Array<{ start: number; end: number; }> = [];
        for (const participant of session.participants) {
            if (participant.kind !== "diagram" || participant.diagramId !== diagramId) continue;
            const doc = participant.source.doc;
            const start = doc && Y.createAbsolutePositionFromRelativePosition(participant.start, doc);
            const end = doc && Y.createAbsolutePositionFromRelativePosition(participant.end, doc);
            if (start && end && end.index > start.index) ranges.push({ start: start.index, end: end.index });
        }
        return ranges;
    }
}

export const diagramComposition = new DiagramCompositionState();

// Observable composition outcome for E2E tests (REQ-014). The literal MODE
// comparison lets Rollup drop this from the production bundle.
if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
    (window as Window & typeof globalThis & { diagramComposition?: unknown; }).diagramComposition = diagramComposition;
}
