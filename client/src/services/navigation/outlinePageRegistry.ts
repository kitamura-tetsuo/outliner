// Which mounted outliner renders which page, so code outside the outliner can
// reveal an item on it.
//
// Deliberately *not* `generalStore.activeViewModel`: every `OutlinerTree`
// assigns itself to that as it is created, and an expanded alias mounts a
// second, embedded tree over the alias target — so "active" means "whichever
// tree mounted last", which may well be an alias rather than the page a caller
// is navigating into. Expanding a branch in the wrong view model silently
// reveals nothing.
//
// What is registered is a small controller rather than the view model itself,
// because changing collapse state is only half the job: the tree has to be
// told to rebuild its display list too, and the view model's own partial
// recalculation is not enough (see `expandItems` in OutlinerTree.svelte).
// Keeping both halves behind one call makes it impossible to do one without
// the other.
//
// A plain module rather than reactive state: this is a lookup table consulted
// imperatively at navigation time, and nothing renders from it.

export interface PageOutlineController {
    /**
     * Expand every collapsed item among `itemIds` and re-render the tree.
     * Returns true when something was actually expanded.
     */
    expandItems: (itemIds: string[]) => boolean;
}

const pageOutlines = new Map<string, PageOutlineController>();

/**
 * Publish a page-level tree's controller for the duration of its mount, keyed
 * by the page item's tree key. Returns the retraction.
 *
 * Embedded (alias) trees must not register: they render someone else's
 * subtree and own no page.
 */
export function registerPageOutline(pageKey: string, controller: PageOutlineController): () => void {
    pageOutlines.set(pageKey, controller);
    return () => {
        // Only retract our own entry: during a page switch the incoming tree
        // may already have claimed the key before the outgoing one is destroyed.
        if (pageOutlines.get(pageKey) === controller) pageOutlines.delete(pageKey);
    };
}

/** The controller of the top-level tree rendering `pageKey`, if it is mounted. */
export function getPageOutline(pageKey: string): PageOutlineController | undefined {
    return pageOutlines.get(pageKey);
}
