import { Item, Project } from "$shared/app-schema";
import type * as Y from "yjs";
import { getGridSourceTableId } from "./gridDocs";
import { bindItemToGrid, getItemGridId } from "./itemBinding";

export const GRID_PLACEMENT_MIME = "application/x-outliner-grid-placement";

export interface GridPlacementDragData {
    itemId: string;
    gridId: string;
    sourcePageId: string;
    sourceWritable: boolean;
}

export function findItem(project: Project, itemId: string): Item | undefined {
    const visit = (items: Iterable<Item>): Item | undefined => {
        for (const item of items) {
            if (item.id === itemId) return item;
            const child = visit(item.items);
            if (child) return child;
        }
    };
    return visit(project.items);
}

export function pageContaining(project: Project, item: Item): Item | undefined {
    let current = item;
    while (current.parent && current.parent.parentKey !== "root") {
        const parentKey = current.parent.parentKey;
        current = new Item(project.ydoc, project.tree, parentKey);
    }
    return current.parent?.parentKey === "root" ? current : undefined;
}

/** Attach a Grid object to a new block at the end of a Page. */
export function appendGridPlacement(doc: Y.Doc, pageId: string, gridId: string, author: string): Item {
    const project = Project.fromDoc(doc);
    const page = project.findPage(pageId);
    if (!page) throw new Error("The destination Page no longer exists.");
    const placement = page.items.addNode(author);
    bindItemToGrid(placement, gridId, getGridSourceTableId(doc, gridId));
    return placement;
}

/** Move only the outline placement; the project-level Grid keeps its identity. */
export function moveGridPlacement(doc: Y.Doc, itemId: string, destinationPageId: string): boolean {
    const project = Project.fromDoc(doc);
    const item = findItem(project, itemId);
    const destination = project.findPage(destinationPageId);
    if (!item || !destination || !getItemGridId(item)) {
        throw new Error("The Grid placement or destination Page no longer exists.");
    }
    const sourcePage = pageContaining(project, item);
    if (sourcePage?.id === destinationPageId) return false;
    doc.transact(() => {
        project.tree.moveChildToParent(item.key, destination.key);
        project.tree.recomputeParentsAndChildren();
        project.tree.setNodeOrderToEnd(item.key);
    });
    return true;
}
