// State for the "Insert transclusion" picker (issue #5310, REQ-003/REQ-004):
// choosing an existing Diagram in the current project and inserting another
// occurrence of it, without creating or copying its source.
//
// Nothing is mutated until `confirm` is called with a chosen Diagram id —
// opening or cancelling the picker has no project-state effect at all. Two
// destinations reuse this one modal: a slash-command cursor target (page
// root or under a Text item) and an explicit parent (the Layout menu's "add
// to this Layout").

import type { Item } from "../schema/app-schema";
import {
    type DiagramInsertOptions,
    type DiagramPlacementResult,
    insertExistingMermaidDiagramAtTarget,
    insertExistingMermaidDiagramUnderParent,
} from "../services/diagram/diagramPlacement";
import { getProjectCapabilities } from "../services/project/projectCapabilities";
import { editorOverlayStore } from "./EditorOverlayStore.svelte";
import { store as generalStore } from "./store.svelte";

type PendingDestination =
    | { kind: "at-target"; target: Item | undefined; remainingText: string; }
    | { kind: "under-parent"; parent: Item | undefined; options?: DiagramInsertOptions; };

class DiagramChooserStore {
    isVisible = $state(false);
    /** Most recent placement outcome — tests observe it; the UI can surface a failure message. */
    lastResult: DiagramPlacementResult | undefined = $state(undefined);

    private pending: PendingDestination | undefined;
    private pendingUserId = "local";

    /** Open the chooser for a slash-command cursor target. */
    showAtTarget(target: Item | undefined, remainingText: string, userId: string) {
        this.pending = { kind: "at-target", target, remainingText };
        this.pendingUserId = userId;
        this.lastResult = undefined;
        this.isVisible = true;
    }

    /** Open the chooser to insert directly under an explicit parent (e.g. a Layout). */
    showUnderParent(parent: Item | undefined, userId: string, options?: DiagramInsertOptions) {
        this.pending = { kind: "under-parent", parent, options };
        this.pendingUserId = userId;
        this.lastResult = undefined;
        this.isVisible = true;
    }

    hide() {
        this.isVisible = false;
        this.pending = undefined;
    }

    confirm(diagramId: string) {
        if (!this.isVisible || !this.pending) return;
        this.isVisible = false;

        const project = generalStore.project;
        const userId = this.pendingUserId;
        const pending = this.pending;
        this.pending = undefined;

        if (!project) {
            this.lastResult = { ok: false, reason: "capability-denied" };
            return;
        }

        const auth = { capabilities: getProjectCapabilities(project), surfaceWritable: true };
        const result = pending.kind === "at-target"
            ? insertExistingMermaidDiagramAtTarget(
                project,
                diagramId,
                pending.target,
                pending.remainingText,
                userId,
                auth,
            )
            : insertExistingMermaidDiagramUnderParent(
                project,
                diagramId,
                pending.parent,
                userId,
                auth,
                pending.options,
            );
        this.lastResult = result;
        if (result.ok) this.focusCreatedItem(result.itemId, userId);
    }

    private focusCreatedItem(itemId: string, userId: string) {
        editorOverlayStore.clearCursorAndSelection(userId);
        editorOverlayStore.setCursor({ itemId, offset: 0, userId, isActive: true });
        editorOverlayStore.setActiveItem(itemId);
        editorOverlayStore.startCursorBlink();
    }

    reset() {
        this.isVisible = false;
        this.lastResult = undefined;
        this.pending = undefined;
        this.pendingUserId = "local";
    }
}

export const diagramChooserStore = $state(new DiagramChooserStore());

// expose for debugging and test access without importing .svelte.ts
// The literal MODE comparison lets Rollup drop this assignment from the
// production bundle (see ENV-production-build-leak.test.ts).
if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
    (window as Window & typeof globalThis & { diagramChooserStore?: DiagramChooserStore; }).diagramChooserStore =
        diagramChooserStore;
}
