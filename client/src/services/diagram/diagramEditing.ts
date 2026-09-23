// Native editing target for a Diagram occurrence (issue #5311).
//
// A Diagram occurrence (componentType "diagram") owns no text. The editor's
// cursor stays on the occurrence — that item id is the *active occurrence*
// used for hit-testing, navigation and scrolling — while every edit goes to
// the one project-owned source Y.Text of the Diagram it references. The
// logical edit identity of a cursor is therefore (project, diagramId,
// "source", offset), never the occurrence id (REQ-002).

import type { Project } from "$shared/app-schema";
import type { Item } from "../../schema/app-schema";
import { getProjectCapabilities } from "../project/projectCapabilities";
import { canMutateDiagrams, canReadDiagrams } from "./diagramAuthorization";
import { getItemDiagramId } from "./diagramBinding";
import { DIAGRAM_SOURCE_EDIT_ORIGIN, reportDiagramEditRefusal } from "./diagramEditSignals";
import { getDiagramSourceYText } from "./diagramService";
import { ensureDiagramUndoManager } from "./diagramUndo";

export { DIAGRAM_SOURCE_EDIT_ORIGIN, type DiagramEditRefusal, reportDiagramEditRefusal } from "./diagramEditSignals";

/**
 * Writability of each mounted occurrence surface, read *when a mutation is
 * attempted* (REQ-010, AS-007): a getter, never a mount-time snapshot, so a
 * surface that turns read-only while its occurrence stays mounted stops
 * authorizing writes immediately. An item rendered by several surfaces is
 * writable only if every one of them is — a surface is an additional
 * restriction, never a grant.
 */
const occurrenceSurfaces = new Map<string, Set<() => boolean>>();

export function registerDiagramOccurrence(itemId: string, isWritable: () => boolean): () => void {
    let surfaces = occurrenceSurfaces.get(itemId);
    if (!surfaces) {
        surfaces = new Set();
        occurrenceSurfaces.set(itemId, surfaces);
    }
    surfaces.add(isWritable);
    return () => {
        const current = occurrenceSurfaces.get(itemId);
        current?.delete(isWritable);
        if (current && current.size === 0) occurrenceSurfaces.delete(itemId);
    };
}

/** Whether an occurrence is mounted on at least one surface. */
export function isDiagramOccurrenceMounted(itemId: string): boolean {
    return occurrenceSurfaces.has(itemId);
}

function occurrenceSurfaceWritable(itemId: string): boolean {
    const surfaces = occurrenceSurfaces.get(itemId);
    if (!surfaces || surfaces.size === 0) return false;
    for (const isWritable of surfaces) {
        if (!isWritable()) return false;
    }
    return true;
}

export function isDiagramItem(item: Item | undefined): boolean {
    return item?.componentType === "diagram";
}

export function diagramIdForItem(item: Item | undefined): string | undefined {
    return item && isDiagramItem(item) ? getItemDiagramId(item) : undefined;
}

/** Whether the current principal may read Diagram source in `project` (REQ-010). */
export function canReadDiagramSource(project: Project | undefined): boolean {
    return canReadDiagrams({ capabilities: getProjectCapabilities(project), surfaceWritable: false });
}

/**
 * Every precondition of a Diagram source mutation invoked through `occurrenceId`,
 * evaluated now: project read and write capability and a currently writable
 * invoking surface.
 */
export function canEditDiagramOccurrence(project: Project, occurrenceId: string): boolean {
    return canMutateDiagrams({
        capabilities: getProjectCapabilities(project),
        surfaceWritable: occurrenceSurfaceWritable(occurrenceId),
    });
}

/** One end of a selection: its owning item and whether it is a character position. */
export interface RangeEnd {
    item: Item | undefined;
    character: boolean;
}

/**
 * A character range with an endpoint inside Diagram source and the other in
 * a different owner (page Text or another Diagram's source) is unsupported:
 * it is reported and refused before any mutation, so no owner receives a
 * partial edit. Ranges inside one owner, Text-only ranges, and structural
 * selections of whole occurrences (node-boundary ends) are unaffected.
 */
export function refuseCrossOwnerDiagramRange(start: RangeEnd, end: RangeEnd): boolean {
    if (!start.item || !end.item || start.item.id === end.item.id) return false;
    const inSource = (edge: RangeEnd) => edge.character && isDiagramItem(edge.item);
    if (!inSource(start) && !inSource(end)) return false;
    reportDiagramEditRefusal({
        itemId: inSource(start) ? start.item.id : end.item.id,
        reason: "cross-owner-range",
    });
    return true;
}

/**
 * Present a Diagram's project-owned Y.Text through the small Item editing
 * interface already consumed by CursorEditor. The occurrence remains the
 * navigation identity; this adapter never stores source on that occurrence.
 * Without read capability nothing resolves, so no protected source reaches the
 * cursor, the shared input bridge, or any occurrence.
 */
export function diagramEditingTarget(project: Project, occurrence: Item): Item | undefined {
    if (!canReadDiagramSource(project)) return undefined;
    const diagramId = diagramIdForItem(occurrence);
    if (!diagramId) return undefined;
    const source = getDiagramSourceYText(project, diagramId);
    if (!source) return undefined;
    ensureDiagramUndoManager(project);

    const authorized = () => {
        if (canEditDiagramOccurrence(project, occurrence.id)) return true;
        reportDiagramEditRefusal({ itemId: occurrence.id, reason: "unauthorized" });
        return false;
    };

    return new Proxy(occurrence, {
        get(target, property, receiver) {
            if (property === "text") return source;
            if (property === "insertTextAt") {
                return (offset: number, text: string) => {
                    if (!text || !authorized()) return;
                    project.ydoc.transact(() => {
                        source.insert(Math.max(0, Math.min(offset, source.length)), text);
                    }, DIAGRAM_SOURCE_EDIT_ORIGIN);
                };
            }
            if (property === "deleteTextAt") {
                return (offset: number, length: number) => {
                    const start = Math.max(0, Math.min(offset, source.length));
                    const count = Math.max(0, Math.min(length, source.length - start));
                    if (!count || !authorized()) return;
                    project.ydoc.transact(() => source.delete(start, count), DIAGRAM_SOURCE_EDIT_ORIGIN);
                };
            }
            if (property === "updateText") {
                return (text: string) => {
                    if (!authorized()) return;
                    project.ydoc.transact(() => {
                        if (source.length) source.delete(0, source.length);
                        if (text) source.insert(0, text);
                    }, DIAGRAM_SOURCE_EDIT_ORIGIN);
                };
            }
            return Reflect.get(target, property, receiver);
        },
    });
}
