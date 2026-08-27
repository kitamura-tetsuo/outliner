// Where a Grid or Calendar is *directly* rendered in the outline (issue
// #5119) — never an indirect dependency. A Table claims no Pages of its own
// even though Grids reference it, and a Schedule claims no Pages even though
// it may read or write a Table: only an outline item whose own
// `componentType`/id binding names the object counts as a placement. Mirrors
// the direct-reference traversal `tableDependencies.ts` already uses for
// Grids-that-reference-a-Table, generalized to the two visual component
// kinds Object Manager links back to.

import type { Item, Project } from "$shared/app-schema";
import * as Y from "yjs";

export interface ObjectPlacement {
    pageId: string;
    pageTitle: string;
    itemId: string;
    /** Tree key — the stable navigation target (`navigateToOutlineItem` takes this, not `itemId`). */
    itemKey: string;
}

export interface PlacementCollections {
    gridPlacements: Map<string, ObjectPlacement[]>;
    calendarPlacements: Map<string, ObjectPlacement[]>;
}

function pushPlacement(map: Map<string, ObjectPlacement[]>, id: string, placement: ObjectPlacement): void {
    const list = map.get(id);
    if (list) list.push(placement);
    else map.set(id, [placement]);
}

/**
 * Walk every Page's outline once and record every item that directly renders
 * a Grid or a Calendar. One traversal serves the whole Object Manager list
 * rather than one per object.
 */
export function collectAllPlacements(project: Project | null | undefined): PlacementCollections {
    const gridPlacements = new Map<string, ObjectPlacement[]>();
    const calendarPlacements = new Map<string, ObjectPlacement[]>();
    if (!project) return { gridPlacements, calendarPlacements };

    function traverseItem(item: Item, page: Item, pageTitle: string): void {
        try {
            const nodeValue = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown> | undefined;
            if (nodeValue) {
                const componentType = nodeValue.get("componentType");
                if (componentType === "yjstable") {
                    const gridId = nodeValue.get("yjsGridId");
                    if (typeof gridId === "string" && gridId) {
                        pushPlacement(gridPlacements, gridId, {
                            pageId: page.id!,
                            pageTitle,
                            itemId: item.id!,
                            itemKey: item.key!,
                        });
                    }
                } else if (componentType === "calendar") {
                    const calendarId = nodeValue.get("calendarId");
                    if (typeof calendarId === "string" && calendarId) {
                        pushPlacement(calendarPlacements, calendarId, {
                            pageId: page.id!,
                            pageTitle,
                            itemId: item.id!,
                            itemKey: item.key!,
                        });
                    }
                }
            }
        } catch (_e) {
            // Node vanished mid-traversal (concurrent edit); skip it.
        }
        for (const child of item.items) {
            if (child) traverseItem(child, page, pageTitle);
        }
    }

    for (const page of project.items) {
        if (!page) continue;
        const pageTitle =
            (page.tree.getNodeValueFromKey(page.key) as Y.Map<unknown> | undefined)?.get("text")?.toString()
            || "Untitled Page";
        traverseItem(page, page, pageTitle);
    }

    return { gridPlacements, calendarPlacements };
}

export function findGridPlacements(project: Project | null | undefined, gridId: string): ObjectPlacement[] {
    return collectAllPlacements(project).gridPlacements.get(gridId) ?? [];
}

export function findCalendarPlacements(project: Project | null | undefined, calendarId: string): ObjectPlacement[] {
    return collectAllPlacements(project).calendarPlacements.get(calendarId) ?? [];
}
