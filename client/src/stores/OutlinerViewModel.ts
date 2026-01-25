import { getLogger } from "../lib/logger";
import { Item, Items } from "../schema/app-schema";

const logger = getLogger();
// Suppress verbose logs in E2E/Test environments
const __IS_E2E__ = (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
    || import.meta.env.MODE === "test"
    || import.meta.env.VITE_IS_TEST === "true";
const debugLog = (...args: any[]) => {
    if (!__IS_E2E__) console.log(...args);
};

const isItemLike = (obj: any): boolean => {
    try {
        const id = obj?.id;
        const txt = obj?.text;
        return typeof id === "string" && id.length > 0
            && (typeof txt === "string" || typeof txt?.toString === "function");
    } catch {
        return false;
    }
};

// View model interface
export interface OutlinerItemViewModel {
    id: string;
    original: Item; // Reference to original Fluid object
    text: string;
    votes: string[];
    author: string;
    created: number;
    lastChanged: number;
    commentCount: number;
}

// Display item information
export interface DisplayItem {
    model: OutlinerItemViewModel;
    depth: number;
    parentId: string | null;
}

/**
 * Store managing the outliner view model
 * Maintains item reference identity to avoid DOM regeneration
 */
export class OutlinerViewModel {
    // View model map by ID (maintains reference identity)
    private viewModels = new Map<string, OutlinerItemViewModel>();

    // ID array indicating display order
    private visibleOrder: string[] = [];

    // Item depth map
    private depthMap = new Map<string, number>();

    // Parent item ID map
    private parentMap = new Map<string, string | null>();

    // Collapsed state map
    private collapsedMap = new Map<string, boolean>();

    // Updating flag
    private _isUpdating = false;

    /**
     * Update view model from data model
     * @param pageItem Root item collection
     */
    updateFromModel(pageItem: Item): void {
        // Check if already processing during update
        if (this._isUpdating) return;

        if (!pageItem) {
            console.error("OutlinerViewModel: updateFromModel called with null pageItem");
            return;
        }

        try {
            this._isUpdating = true;

            console.error(
                `OutlinerViewModel: updateFromModel for pageItem.id=${pageItem.id} isItemLike=${isItemLike(pageItem)}`,
            );
            console.error(
                "OutlinerViewModel: pageItem.items length:",
                (pageItem.items as any)?.length || 0,
            );

            // Update or add existing view models
            this.ensureViewModelsItemExist(pageItem);

            console.error(
                "OutlinerViewModel: viewModels count after ensure:",
                this.viewModels.size,
            );

            // Recalculate display order and depth - start from pageItem itself
            this.recalculateOrderAndDepthItem(pageItem);

            console.error(
                "OutlinerViewModel: visibleOrder length after recalculate:",
                this.visibleOrder.length,
            );
            if (this.visibleOrder.length === 0) {
                console.error("OutlinerViewModel: visibleOrder is EMPTY!");
            }
        } catch (err) {
            console.error("OutlinerViewModel: Error in updateFromModel:", err);
        } finally {
            this._isUpdating = false;
        }
    }

    /**
     * Ensure item view model exists, create or update as needed
     */
    private ensureViewModelsItemsExist(
        items: Items,
        parentId: string | null = null,
    ): void {
        if (!items) return;

        for (const child of items) {
            this.ensureViewModelsItemExist(child, parentId);
        }
    }

    private ensureViewModelsItemExist(
        item: Item,
        parentId: string | null = null,
    ): void {
        if (!isItemLike(item)) return;

        debugLog(
            `OutlinerViewModel: ensureViewModelsItemExist for item "${item.text}" (id: ${item.id})`,
        );

        // Update existing view model or create new
        const existingViewModel = this.viewModels.get(item.id);
        if (existingViewModel) {
            // Update properties (maintain reference)
            // Performance optimization: Recalculate only if lastChanged has modified
            // Y.Text.toString() is a high-cost operation, so avoid unnecessary calls
            // Use safe type checking instead of explicit any casts
            const lastChangedProp = "lastChanged" in item ? item.lastChanged : undefined;
            const newLastChanged = typeof lastChangedProp === "number" ? lastChangedProp : 0;

            if (existingViewModel.lastChanged !== newLastChanged) {
                existingViewModel.text = item.text.toString();

                // Safely access votes array
                let votesArray: string[] = [];
                if (item.votes && typeof item.votes.toArray === "function") {
                    votesArray = item.votes.toArray();
                } else if ("votes" in item && Array.isArray((item as unknown as { votes: string[]; }).votes)) {
                    votesArray = (item as unknown as { votes: string[]; }).votes;
                }
                existingViewModel.votes = [...votesArray];

                existingViewModel.lastChanged = newLastChanged;
                // Item wrapper exposes comments wrapper, but we need length from underlying Y.Array or wrapper
                const comments = item.comments;
                existingViewModel.commentCount = comments?.length ?? 0;
                debugLog(
                    `OutlinerViewModel: Updated existing view model for "${existingViewModel.text}"`,
                );
            }
        } else {
            // Create new view model
            this.viewModels.set(item.id, {
                id: item.id,
                original: item,
                text: item.text.toString(),
                votes: [...((item as any).votes || [])],
                author: (item as any).author,
                created: (item as any).created,
                lastChanged: (item as any).lastChanged,
                commentCount: (item as any).comments?.length ?? 0,
            });
            debugLog(
                `OutlinerViewModel: Created new view model for "${item.text}"`,
            );
        }

        // Set parent
        this.parentMap.set(item.id, parentId);

        // Process child items too
        if (((it: any) => (it && typeof it.length === "number" && typeof it.at === "function"))((item as any).items)) {
            const children = item.items;
            debugLog(
                `OutlinerViewModel: Processing ${children.length} children for "${item.text.toString()}"`,
            );
            this.ensureViewModelsItemsExist(children, item.id);
        } else {
            debugLog(`OutlinerViewModel: No children for "${item.text.toString()}"`);
        }
    }
    /**
     * Recalculate display order and depth
     */
    private recalculateOrderAndDepth(
        items: Items,
        depth: number = 0,
        parentId: string | null = null,
    ): void {
        if (!items) return;

        // Initialize display order and depth first
        if (depth === 0) {
            this.visibleOrder = [];
        }

        for (const child of items) {
            this.recalculateOrderAndDepthItem(child, depth, parentId);
        }
    }
    /**
     * Recalculate display order and depth (for single item)
     */
    private recalculateOrderAndDepthItem(
        item: Item,
        depth: number = 0,
        parentId: string | null = null, // eslint-disable-line @typescript-eslint/no-unused-vars
    ): void {
        if (!isItemLike(item)) return;

        // Initialize display order first (only for root item)
        if (depth === 0) {
            this.visibleOrder = [];
        }

        debugLog(
            `OutlinerViewModel: recalculateOrderAndDepthItem for "${item.text.toString()}" (depth: ${depth})`,
        );

        // Add to display order
        this.visibleOrder.push(item.id);

        // Set depth
        this.depthMap.set(item.id, depth);
        const vm = this.viewModels.get(item.id);
        if (vm) {
            vm.commentCount = (item as any).comments?.length ?? 0;
        }

        // Process child items (only if not collapsed)
        const isCollapsed = this.collapsedMap.get(item.id);
        const ch: any = (item as any).items;
        const hasChildren = !!(ch && typeof ch.length === "number" && typeof ch.at === "function" && ch.length > 0);

        debugLog(
            `OutlinerViewModel: Item "${item.text.toString()}" - hasChildren: ${hasChildren}, isCollapsed: ${isCollapsed}, childrenCount: ${
                hasChildren ? item.items.length : 0
            }`,
        );

        if (hasChildren && !isCollapsed) {
            const children = item.items;
            debugLog(
                `OutlinerViewModel: Processing ${children.length} children for "${item.text.toString()}"`,
            );
            for (const child of children) {
                this.recalculateOrderAndDepthItem(child, depth + 1, item.id);
            }
        } else if (hasChildren && isCollapsed) {
            debugLog(
                `OutlinerViewModel: Skipping children for "${item.text}" because it's collapsed`,
            );
        } else if (!hasChildren) {
            console.log(`OutlinerViewModel: No children for "${item.text}"`);
        }
    }

    /**
     * Toggle item collapsed state
     */
    toggleCollapsed(itemId: string): void {
        const isCollapsed = this.collapsedMap.get(itemId) || false;
        this.collapsedMap.set(itemId, !isCollapsed);

        // Recalculate display info from model (maintain item instance)
        const rootItem = this.findRootItem(itemId);
        if (!rootItem) return;
        if (
            ((it: any) => (it && typeof it.length === "number" && typeof it.at === "function"))(
                (rootItem as any)?.items,
            )
        ) {
            this.recalculateOrderAndDepth(rootItem.items);
        }
    }

    /**
     * Find root item
     */
    private findRootItem(itemId: string): Item | null {
        const item = this.viewModels.get(itemId)?.original;
        if (!item) return null;

        let current: Item = item;
        let parentList = current.parent;

        while (parentList && parentList.parentKey !== "root") {
            current = new Item(current.ydoc, current.tree, parentList.parentKey);
            parentList = current.parent;
        }

        return current;
    }

    /**
     * Get display item list
     */
    getVisibleItems(): DisplayItem[] {
        return this.visibleOrder
            .map(id => {
                const model = this.viewModels.get(id);
                if (!model) {
                    logger.error({ id }, "View model not found for ID");
                    return null;
                }

                return {
                    model,
                    depth: this.depthMap.get(id) || 0,
                    parentId: this.parentMap.get(id) || null,
                };
            })
            .filter((item): item is DisplayItem => item !== null);
    }

    /**
     * Get item collapsed state
     */
    isCollapsed(itemId: string): boolean {
        return this.collapsedMap.get(itemId) || false;
    }

    /**
     * Check if item has children
     */
    hasChildren(itemId: string): boolean {
        const model = this.viewModels.get(itemId);
        if (!model || !model.original || !model.original.items) return false;
        const ch: any = (model.original as any).items;
        return !!(ch && typeof ch.length === "number" && typeof ch.at === "function" && ch.length > 0);
    }

    /**
     * Get view model directly
     */
    getViewModel(id: string): OutlinerItemViewModel | undefined {
        return this.viewModels.get(id);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.viewModels.clear();
        this.visibleOrder = [];
        this.depthMap.clear();
        this.parentMap.clear();
        this.collapsedMap.clear();
    }
}
