import { Project } from "$shared/app-schema";
import type * as Y from "yjs";
import { setItemCalendarId } from "../calendar/calendarBinding";
import { getCalendar } from "../calendar/calendarService";
import { getGridHandles } from "../yjstable/gridDocs";
import { appendGridPlacement } from "../yjstable/gridPlacement";
import { getKanban } from "../yjstable/kanbanDocs";
import { createKanban } from "../yjstable/kanbanDocs";
import { getTableRegistry } from "../yjstable/tableDocs";

export type PlaceableObjectType = "grid" | "calendar" | "kanban" | "table";

export interface ObjectPlacementDragData {
    kind: "object-placement";
    objectType: PlaceableObjectType;
    objectId: string;
}

export const OBJECT_PLACEMENT_MIME = "application/x-outliner-object-placement";

export interface PlacementAuthorization {
    /** The normal project session admitted this caller to the project. */
    projectAccess: boolean;
    /** The concrete Page/Layout surface permits structural edits. */
    surfaceWritable: boolean;
}

function requirePlacementAuthorization(authorization: PlacementAuthorization): void {
    if (!authorization.projectAccess) throw new Error("Project access is unavailable.");
    if (!authorization.surfaceWritable) throw new Error("The destination is read-only.");
}

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
                && (data.objectType === "grid" || data.objectType === "calendar" || data.objectType === "kanban"
                    || data.objectType === "table")
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
    authorization: PlacementAuthorization,
): void {
    requirePlacementAuthorization(authorization);
    const project = Project.fromDoc(doc);
    if (objectType === "grid") {
        if (!getGridHandles(doc, objectId)) throw new Error("The Grid no longer exists.");
        doc.transact(() => appendGridPlacement(doc, pageId, objectId, author));
        return;
    }
    if (objectType === "kanban") {
        if (!getKanban(doc, objectId)) throw new Error("The Kanban no longer exists.");
        const page = project.findPage(pageId);
        if (!page) throw new Error("The destination Page no longer exists.");
        doc.transact(() => {
            // Source and destination were both revalidated immediately before
            // the single synchronous structural mutation.
            if (!getKanban(doc, objectId) || !project.findPage(pageId)) {
                throw new Error("The Kanban or destination Page no longer exists.");
            }
            const placement = page.items.addNode(author);
            placement.componentType = "kanban";
            placement.kanbanId = objectId;
        });
        return;
    }
    if (objectType === "table") {
        const page = project.findPage(pageId);
        if (!page) throw new Error("The destination Page no longer exists.");
        if (!getTableRegistry(doc).has(objectId)) throw new Error("The source Table no longer exists.");
        doc.transact(() => {
            // Revalidate both authorities at the mutation boundary. Any throw
            // aborts before either a definition or placement is published.
            if (!project.findPage(pageId) || !getTableRegistry(doc).has(objectId)) {
                throw new Error("The source Table or destination Page no longer exists.");
            }
            const kanbanId = createKanban(doc, objectId, { name: "Kanban" });
            const placement = page.items.addNode(author);
            placement.componentType = "kanban";
            placement.kanbanId = kanbanId;
        });
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
