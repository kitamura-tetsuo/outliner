import type { Project } from "$shared/app-schema";
import type { Item } from "../../schema/app-schema";
import { getProjectCapabilities, type ProjectCapabilities } from "../project/projectCapabilities";
import { canMutateDiagrams, canReadDiagrams } from "./diagramAuthorization";
import { getItemDiagramId } from "./diagramBinding";
import { getDiagramSourceYText } from "./diagramService";

const writableOccurrences = new Map<string, boolean>();

export function registerDiagramOccurrence(itemId: string, writable: boolean): () => void {
    writableOccurrences.set(itemId, writable);
    return () => writableOccurrences.delete(itemId);
}

export function isDiagramItem(item: Item | undefined): boolean {
    return item?.componentType === "diagram";
}

export function diagramIdForItem(item: Item | undefined): string | undefined {
    return item && isDiagramItem(item) ? getItemDiagramId(item) : undefined;
}

export function canEditDiagramOccurrence(project: Project, item: Item): boolean {
    return canMutateDiagrams({
        capabilities: getProjectCapabilities(project),
        surfaceWritable: writableOccurrences.get(item.id) === true,
    });
}

function reportMutationRefusal(itemId: string): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("diagram-edit-refused", { detail: { itemId } }));
    }
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
    reportMutationRefusal(inSource(start) ? start.item.id : end.item.id);
    return true;
}

/**
 * Present a Diagram's project-owned Y.Text through the small Item editing
 * interface already consumed by CursorEditor. The occurrence remains the
 * navigation identity; this adapter never stores source on that occurrence.
 */
export function diagramEditingTarget(
    project: Project,
    occurrence: Item,
    capabilities: ProjectCapabilities = getProjectCapabilities(project),
): Item | undefined {
    // Without read capability no source reaches the cursor, the shared input
    // bridge, or any occurrence: the target stays unresolved.
    if (!canReadDiagrams({ capabilities, surfaceWritable: false })) return undefined;
    const diagramId = diagramIdForItem(occurrence);
    if (!diagramId) return undefined;
    const source = getDiagramSourceYText(project, diagramId);
    if (!source) return undefined;

    return new Proxy(occurrence, {
        get(target, property, receiver) {
            if (property === "text") return source;
            if (property === "insertTextAt") {
                return (offset: number, text: string) => {
                    if (!canEditDiagramOccurrence(project, occurrence)) {
                        reportMutationRefusal(occurrence.id);
                        return;
                    }
                    if (text) source.insert(Math.max(0, Math.min(offset, source.length)), text);
                };
            }
            if (property === "deleteTextAt") {
                return (offset: number, length: number) => {
                    if (!canEditDiagramOccurrence(project, occurrence)) {
                        reportMutationRefusal(occurrence.id);
                        return;
                    }
                    const start = Math.max(0, Math.min(offset, source.length));
                    const count = Math.max(0, Math.min(length, source.length - start));
                    if (count) source.delete(start, count);
                };
            }
            if (property === "updateText") {
                return (text: string) => {
                    if (!canEditDiagramOccurrence(project, occurrence)) {
                        reportMutationRefusal(occurrence.id);
                        return;
                    }
                    if (source.length) source.delete(0, source.length);
                    if (text) source.insert(0, text);
                };
            }
            return Reflect.get(target, property, receiver);
        },
    });
}
