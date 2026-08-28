import { Project } from "$shared/app-schema";
import type * as Y from "yjs";
import { setItemCalendarId } from "../calendar/calendarBinding";
import { getCalendar } from "../calendar/calendarService";
import { getGridHandles } from "../yjstable/gridDocs";
import { appendGridPlacement } from "../yjstable/gridPlacement";

export type PlaceableObjectType = "grid" | "calendar";

export interface ObjectPlacementDragData {
    kind: "object-placement";
    objectType: PlaceableObjectType;
    objectId: string;
}

export const OBJECT_PLACEMENT_MIME = "application/x-outliner-object-placement";

let activeDrag: ObjectPlacementDragData | undefined;

export function writeObjectPlacementDrag(
    event: DragEvent,
    objectType: PlaceableObjectType,
    objectId: string,
): ObjectPlacementDragData | undefined {
    if (!event.dataTransfer) return undefined;
    const data: ObjectPlacementDragData = { kind: "object-placement", objectType, objectId };
    activeDrag = data;
    event.dataTransfer.setData(OBJECT_PLACEMENT_MIME, JSON.stringify(data));
    event.dataTransfer.effectAllowed = "copy";
    return data;
}

export function isObjectPlacementDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(OBJECT_PLACEMENT_MIME);
}

/** Read during the native drop event, before callers cross an async boundary. */
export function readObjectPlacementDrag(event: DragEvent): ObjectPlacementDragData | undefined {
    const raw = event.dataTransfer?.getData(OBJECT_PLACEMENT_MIME);
    if (raw) {
        try {
            const data = JSON.parse(raw) as Partial<ObjectPlacementDragData>;
            if (
                data.kind === "object-placement"
                && (data.objectType === "grid" || data.objectType === "calendar")
                && typeof data.objectId === "string"
                && data.objectId.length > 0
            ) return data as ObjectPlacementDragData;
        } catch {
            return undefined;
        }
    }
    return isObjectPlacementDrag(event) ? activeDrag : undefined;
}

/** Append a reference to an existing visual object; never creates its definition. */
export function placeObjectOnPage(
    doc: Y.Doc,
    pageId: string,
    objectType: PlaceableObjectType,
    objectId: string,
    author: string,
): void {
    const project = Project.fromDoc(doc);
    if (objectType === "grid") {
        if (!getGridHandles(doc, objectId)) throw new Error("The Grid no longer exists.");
        doc.transact(() => appendGridPlacement(doc, pageId, objectId, author));
        return;
    }
    if (!getCalendar(project, objectId)) throw new Error("The Calendar no longer exists.");
    const page = project.findPage(pageId);
    if (!page) throw new Error("The destination Page no longer exists.");
    doc.transact(() => {
        const placement = page.items.addNode(author);
        placement.componentType = "calendar";
        setItemCalendarId(placement, objectId);
    });
}
