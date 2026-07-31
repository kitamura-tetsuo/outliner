import type { Item, Items } from "../../../shared/src/app-schema";
import { getLogger } from "../lib/logger";

const logger = getLogger("ItemUtils");

/**
 * Inserts a new item as a sibling after the specified target node.
 * If the target node or its parent is not found, falls back to appending
 * to the page's root items list.
 *
 * @param targetNode The node after which to insert the new item (e.g. from cursor.findTarget())
 * @param userId The ID of the user performing the action
 * @returns The newly created item, or null/undefined if insertion fails
 */
export function insertItemAfterTargetOrAppend(targetNode: Item | undefined | null, userId: string = "local"): unknown {
    let items: Items | any = null;
    let insertIndex = -1;

    if (targetNode) {
        const p = targetNode.parent;
        if (p && typeof p.addNode === "function") {
            items = p;
            const idx = targetNode.indexInParent();
            if (idx !== -1) {
                insertIndex = idx + 1;
            }
        }
    }

    if (!items) {
        // Fallback to item list of page content
        const w = typeof window !== "undefined"
            ? (window as Window & typeof globalThis & {
                appStore?: { currentPage?: { items?: unknown[]; }; };
                generalStore?: { currentPage?: { items?: unknown[]; }; };
            })
            : undefined;
        const gs = w?.appStore || w?.generalStore;
        items = (gs as {
            currentPage?: {
                items?: {
                    addNode: (userId: string, prevLen?: number) => unknown;
                    length: number;
                    at: (index: number) => unknown;
                    [key: number]: unknown;
                };
            };
        })?.currentPage?.items;
        insertIndex = items?.length ?? -1;
    }

    if (items && typeof items.addNode === "function") {
        let newItem: unknown = null;
        try {
            newItem = insertIndex !== -1 ? items.addNode(userId, insertIndex) : items.addNode(userId);
        } catch {
            try {
                const prevLen = typeof items.length === "number" ? items.length : 0;
                newItem = items.addNode(userId, prevLen);
            } catch (e) {
                logger.error(e);
            }
        }

        if (!newItem) {
            const lastIndex = (items.length ?? 0) - 1;
            newItem = items.at ? items.at(lastIndex) : items[lastIndex];
        }
        return newItem;
    }

    return null;
}
