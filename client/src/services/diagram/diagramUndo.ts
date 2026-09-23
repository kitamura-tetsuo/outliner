// Diagram source history (issue #5311, REQ-009/REQ-010).
//
// Diagram source lives in the project's `diagrams` registry, outside the
// outline's `orderedTree` undo scope, so it gets its own `Y.UndoManager`
// registered with the global undo router — the same arrangement Calendars and
// Tables use. The router orders entries across scopes chronologically, which is
// what makes Text → Diagram → Text undo in reverse command order. Only local
// source edits (DIAGRAM_SOURCE_EDIT_ORIGIN) are tracked: Diagram creation keeps
// its existing history semantics, and seeding or remote updates never become
// local undo steps.
//
// Replaying Diagram history is itself a Diagram mutation, so the router asks
// this scope for authorization before consuming an entry. A refused Undo/Redo
// leaves its entry in place: nothing is consumed, skipped or reordered.

import type { Project } from "$shared/app-schema";
import * as Y from "yjs";
import { invokingSurfaceWritable } from "../editorSurface";
import { getProjectCapabilities } from "../project/projectCapabilities";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { canMutateDiagrams } from "./diagramAuthorization";
import { DIAGRAM_SOURCE_EDIT_ORIGIN, reportDiagramEditRefusal } from "./diagramEditSignals";

let current: { doc: Y.Doc; undo: Y.UndoManager; } | undefined;

export function ensureDiagramUndoManager(project: Project): Y.UndoManager {
    if (current && current.doc === project.ydoc) return current.undo;
    destroyDiagramUndoManager();
    const undo = new Y.UndoManager(project.diagrams, { trackedOrigins: new Set([DIAGRAM_SOURCE_EDIT_ORIGIN]) });
    current = { doc: project.ydoc, undo };
    globalUndoRouter.register(undo, {
        authorize: () => {
            const allowed = canMutateDiagrams({
                capabilities: getProjectCapabilities(project),
                surfaceWritable: invokingSurfaceWritable(),
            });
            if (!allowed) reportDiagramEditRefusal({ reason: "unauthorized" });
            return allowed;
        },
    });
    return undo;
}

export function destroyDiagramUndoManager(): void {
    if (!current) return;
    globalUndoRouter.unregister(current.undo);
    current.undo.destroy();
    current = undefined;
}
