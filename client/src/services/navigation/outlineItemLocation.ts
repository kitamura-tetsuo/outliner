// Where an outline item lives: which page owns it, and which ancestors stand
// between the two.
//
// Anything that holds a *stable item identity* and wants to show the user that
// item — a calendar entry's `source_id` (#4982), and backlinks/search results
// later — needs the same three answers: the owning page (to route to), the
// ancestors (to expand, or the item stays hidden inside a collapsed branch),
// and the item's own display id (what the DOM and the view model address it
// by). Resolving them from the project tree keeps the answer independent of
// what is currently rendered: never a DOM scan, never a title match.
//
// The identity accepted here is the tree key, which is exactly what
// `itemsRelation.ts` projects as `outline_items.id` (and therefore what a
// calendar query aliases to `source_id`) — "guaranteed present and unique",
// unlike the item's own `id` field. A row whose identity names no node of
// this tree — a table-derived row, or an item deleted since the query ran —
// resolves to `undefined`, which is what makes "this row is not addressable
// as an outline item" answerable without throwing.

import { Item } from "../../schema/app-schema";
import type { Project } from "../../schema/app-schema";
import { safeGetNodeParent } from "../../utils/treeUtils";

/** Depth bound; only ever reached if a malformed parent history introduced a cycle. */
const MAX_DEPTH = 1000;

export interface OutlineItemLocation {
    /** Tree key of the item — the identity this module was asked about. */
    itemKey: string;
    /** The item's `id` field: how the view model, the DOM and the cursor address it. */
    itemId: string;
    /** Tree key of the top-level item (the page) that owns `itemKey`. */
    pageKey: string;
    /** The page's `id` field. */
    pageId: string;
    /** The page's current title, i.e. the page route's segment before encoding. */
    pageTitle: string;
    /**
     * Every id that must not be collapsed for the item to be visible — the
     * page itself first, then each intermediate ancestor outermost-first.
     * Excludes the item: collapsing an item hides its children, not itself.
     */
    ancestorIds: string[];
    /** True when the resolved item *is* the page (a top-level item). */
    isPageRoot: boolean;
}

function itemIdOf(project: Project, key: string): string {
    try {
        return new Item(project.ydoc, project.tree, key).id || key;
    } catch (_e) {
        // A node that vanished between the walk and this read: the key is
        // still the best identity available, and the caller's reveal step
        // simply finds nothing.
        return key;
    }
}

function itemTextOf(project: Project, key: string): string {
    try {
        return new Item(project.ydoc, project.tree, key).text?.toString() ?? "";
    } catch (_e) {
        return "";
    }
}

/**
 * Resolve `itemKey` to its owning page and ancestor path, or `undefined` when
 * it names no live node of `project`'s tree.
 */
export function resolveOutlineItemLocation(
    project: Project | undefined,
    itemKey: string | undefined,
): OutlineItemLocation | undefined {
    const tree = project?.tree;
    if (!project || !tree || !itemKey || itemKey === "root") return undefined;
    if (typeof tree.hasNode === "function" && !tree.hasNode(itemKey)) return undefined;

    // The chain from the item up to (and including) its page.
    const chain: string[] = [itemKey];
    let current = itemKey;
    let reachedRoot = false;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
        const parent = safeGetNodeParent(tree, current);
        // A node detached from the tree has no parent and therefore no page;
        // treating it as addressable would route the user nowhere.
        if (parent === undefined) return undefined;
        if (parent === "root") {
            reachedRoot = true;
            break;
        }
        chain.push(parent);
        current = parent;
    }
    if (!reachedRoot) return undefined;

    const pageKey = chain[chain.length - 1];
    // chain is item-first; the ancestors to expand are everything above the
    // item, and the outermost of them (the page) must come first so a caller
    // expanding in order never re-hides what it just revealed.
    const ancestorKeys = chain.slice(1).reverse();

    return {
        itemKey,
        itemId: itemIdOf(project, itemKey),
        pageKey,
        pageId: itemIdOf(project, pageKey),
        pageTitle: itemTextOf(project, pageKey),
        ancestorIds: ancestorKeys.map((key) => itemIdOf(project, key)),
        isPageRoot: chain.length === 1,
    };
}
