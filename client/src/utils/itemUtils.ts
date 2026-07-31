import type { Item } from "../schema/app-schema";
import { store as generalStore } from "../stores/store.svelte";

/**
 * Inserts a new item as the sibling immediately after `target`.
 *
 * Mirrors what `OutlinerItem.addNewItem()` does for the Enter key so that items
 * created from the command palette land next to the cursor instead of at the
 * bottom of the page. Appends to the current page's item list instead when
 * there is no usable target — no cursor, an item outside the page tree, or the
 * page's own root row, whose siblings are other pages rather than items.
 *
 * @param target Item the cursor is on, e.g. from `cursor.findTarget()`
 * @param author User id recorded as the author of the new item
 * @returns The newly created item, or undefined when there is no page to insert into
 */
export function insertItemAfterTargetOrAppend(
    target: Item | undefined,
    author: string,
): Item | undefined {
    const page = generalStore.currentPage;
    if (target && target.id !== page?.id) {
        const parent = target.parent;
        const index = target.indexInParent();
        if (parent && index !== -1) {
            return parent.addNode(author, index + 1);
        }
    }

    const items = page?.items;
    return items ? items.addNode(author, items.length) : undefined;
}
