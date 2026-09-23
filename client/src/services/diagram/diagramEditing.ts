import type { Project } from "$shared/app-schema";
import type { Item } from "../../schema/app-schema";
import { getProjectCapabilities } from "../project/projectCapabilities";
import { canMutateDiagrams } from "./diagramAuthorization";
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

/**
 * Present a Diagram's project-owned Y.Text through the small Item editing
 * interface already consumed by CursorEditor. The occurrence remains the
 * navigation identity; this adapter never stores source on that occurrence.
 */
export function diagramEditingTarget(project: Project, occurrence: Item): Item | undefined {
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
