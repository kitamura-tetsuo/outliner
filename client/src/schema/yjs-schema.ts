// Minimal Yjs-based schema wrappers for yjsService and tests

import { v4 as uuid } from "uuid";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";

console.log("HELLO WORLD YJS SCHEMA LOADED");

export type Comment = {
    id: string;
    author: string;
    text: string;
    created: number;
    lastChanged: number;
};

export type CommentValueType = string | number;

// Wrapper for comment collection (Y.Array<Y.Map>)
export class Comments {
    private readonly yArray: Y.Array<Y.Map<CommentValueType>>;
    constructor(yArray: Y.Array<Y.Map<CommentValueType>>, private readonly itemId: string) {
        this.yArray = yArray;
    }

    addComment(author: string, text: string) {
        const time = Date.now();
        const c = new Y.Map<CommentValueType>();
        const id = uuid();
        c.set("id", id);
        c.set("author", author);
        c.set("text", text);
        c.set("created", time);
        c.set("lastChanged", time);
        this.yArray.push([c]);
        console.error(
            `[Comments.addComment] Added comment ${id} to item ${this.itemId}. New count: ${this.yArray.length}`,
        );

        // Client side event dispatch for UI updates (badge count)
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("item-comment-count", { detail: { id: this.itemId, count: this.yArray.length } }),
            );
        }
        return { id: id };
    }

    deleteComment(commentId: string) {
        console.error(`[Comments.deleteComment] Attempting to delete comment ${commentId} from item ${this.itemId}`);
        const ids = this.yArray.toArray().map((m) => m.get("id"));
        const idx = ids.findIndex((id) => id === commentId);

        if (idx >= 0) {
            this.yArray.delete(idx, 1);
            console.error(`[Comments.deleteComment] Deleted comment at index ${idx}. New count: ${this.yArray.length}`);
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("item-comment-count", { detail: { id: this.itemId, count: this.yArray.length } }),
                );
            }
        } else {
            console.error(
                `[Comments.deleteComment] Comment ${commentId} not found in item ${this.itemId}. Available: ${
                    ids.join(", ")
                }`,
            );
        }
    }

    get length() {
        return this.yArray.length;
    }
}

export class Item {
    constructor(
        public readonly ydoc: Y.Doc,
        public readonly tree: YTree,
        public readonly key: string,
    ) {}

    private get value(): Y.Map<any> {
        return this.tree.getNodeValueFromKey(this.key) as Y.Map<any>;
    }

    get id(): string {
        return this.value.get("id") as string;
    }

    get text(): Y.Text {
        return this.value.get("text") as Y.Text;
    }

    get aliasTargetId(): string | undefined {
        return this.value.get("aliasTargetId") as string | undefined;
    }

    set aliasTargetId(value: string | undefined) {
        if (value === undefined) {
            this.value.delete("aliasTargetId");
        } else {
            this.value.set("aliasTargetId", value);
        }
    }

    updateText(text: string) {
        const t = this.text;
        if (t) {
            t.delete(0, t.length);
            if (text) t.insert(0, text);
        }
        this.value.set("lastChanged", Date.now());
    }

    // Attachments: Ensure Y.Array<string> is returned
    get attachments(): Y.Array<string> {
        let arr = this.value.get("attachments") as Y.Array<string> | undefined;
        if (!arr) {
            arr = new Y.Array<string>();
            this.value.set("attachments", arr);
        }
        return arr;
    }

    // Add attachment (ignore duplicates). Also fires CustomEvent for test synchronization
    addAttachment(url: string) {
        const arr = this.attachments;
        const existing = arr.toArray();
        if (!existing.includes(url)) {
            arr.push([url]);
            this.value.set("lastChanged", Date.now());
            try {
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("item-attachments-changed", { detail: { id: this.id, count: arr.length } }),
                    );
                }
            } catch {}
        }
    }

    // Remove attachment
    removeAttachment(url: string) {
        const arr = this.attachments;
        const existing = arr.toArray();
        const idx = existing.indexOf(url);
        if (idx >= 0) {
            arr.delete(idx, 1);
            this.value.set("lastChanged", Date.now());
            try {
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("item-attachments-changed", { detail: { id: this.id, count: arr.length } }),
                    );
                }
            } catch {}
        }
    }

    // Comments: wrap in a dedicated class
    get comments() {
        // server implements Comments class wrapper, here we can simplify or assume mapped
        // Ideally we should match server implementation structure if complex
        // For E2E test dispatch, we need basic operations.
        // Assuming 'comments' is a Y.Array in the item's map
        // Fix: Explicitly cast to match Comments constructor expectation
        const yarr = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>>;
        if (!yarr) {
            // Initialize if missing (schema should ensure, but safety first)
            const arr = new Y.Array<Y.Map<CommentValueType>>();
            this.value.set("comments", arr);
            return new Comments(arr, this.id);
        }
        return new Comments(yarr, this.id);
    }

    addComment(author: string, text: string) {
        return this.comments.addComment(author, text);
    }

    removeComment(commentId: string) {
        this.comments.deleteComment(commentId);
    }

    get items(): Items {
        return wrapArrayLike(new Items(this.ydoc, this.tree, this.key));
    }

    get parent(): Items | null {
        const parentKey = (this.tree as any).getNodeParentFromKey(this.key);
        if (!parentKey) return null;
        return new Items(this.ydoc, this.tree, parentKey);
    }
}

export class Items {
    constructor(
        public readonly ydoc: Y.Doc,
        public readonly tree: YTree,
        public readonly parentKey: string,
    ) {}

    private childrenKeys(): string[] {
        const children = this.tree.getNodeChildrenFromKey(this.parentKey);
        return this.tree.sortChildrenByOrder(children, this.parentKey);
    }

    get length(): number {
        return this.childrenKeys().length;
    }

    at(index: number): Item | undefined {
        const key = this.childrenKeys()[index];
        return key ? new Item(this.ydoc, this.tree, key) : undefined;
    }

    addNode(author: string, index?: number): Item {
        const nodeKey = this.tree.generateNodeKey();
        const now = Date.now();

        const value = new Y.Map<any>();
        value.set("id", nodeKey);
        value.set("author", author);
        value.set("created", now);
        value.set("lastChanged", now);
        value.set("componentType", undefined);
        value.set("aliasTargetId", undefined);
        value.set("text", new Y.Text());
        value.set("votes", new Y.Array<string>());
        value.set("attachments", new Y.Array<string>());
        value.set("comments", new Y.Array<Y.Map<any>>());

        this.tree.createNode(this.parentKey, nodeKey, value);

        if (index === undefined) {
            this.tree.setNodeOrderToEnd(nodeKey);
        } else {
            const keys = this.childrenKeys();
            const clamped = Math.max(0, Math.min(index, keys.length - 1));
            const target = keys[clamped];
            if (!target) this.tree.setNodeOrderToEnd(nodeKey);
            else if (clamped === 0) this.tree.setNodeBefore(nodeKey, target);
            else this.tree.setNodeAfter(nodeKey, keys[clamped - 1]);
        }

        return new Item(this.ydoc, this.tree, nodeKey);
    }

    indexOf(item: Item): number {
        return this.childrenKeys().indexOf(item.key);
    }

    removeAt(index: number) {
        const key = this.childrenKeys()[index];
        if (key) this.tree.deleteNodeAndDescendants(key);
    }

    addAlias(targetId: string, author: string, index?: number): Item {
        const it = this.addNode(author, index);
        it.aliasTargetId = targetId;
        return it;
    }

    [Symbol.iterator](): Iterator<Item> {
        const keys = this.childrenKeys();
        let i = 0;
        return {
            next: () => {
                if (i < keys.length) {
                    const value = new Item(this.ydoc, this.tree, keys[i++]);
                    return { value, done: false };
                }
                return { value: undefined, done: true } as IteratorResult<Item>;
            },
        };
    }

    /**
     * Iterate over items without sorting.
     * Use this when order doesn't matter for better performance (O(N) vs O(N log N)).
     */
    *iterateUnordered(): IterableIterator<Item> {
        const keys = this.tree.getNodeChildrenFromKey(this.parentKey);
        for (const key of keys) {
            yield new Item(this.ydoc, this.tree, key);
        }
    }
}

export class Project {
    constructor(public readonly ydoc: Y.Doc, public readonly tree: YTree) {}

    static createInstance(title: string): Project {
        const doc = new Y.Doc();
        const ymap = doc.getMap("orderedTree");
        const tree = new YTree(ymap);
        const meta = doc.getMap("metadata");
        meta.set("title", title);
        return new Project(doc, tree);
    }

    static fromDoc(doc: Y.Doc): Project {
        const ymap = doc.getMap("orderedTree");
        const tree = new YTree(ymap);
        return new Project(doc, tree);
    }

    get title(): string {
        try {
            const meta = this.ydoc.getMap("metadata") as Y.Map<any>;
            return String(meta.get("title") ?? "");
        } catch {
            return "";
        }
    }

    get items(): Items {
        return wrapArrayLike(new Items(this.ydoc, this.tree, "root"));
    }

    /**
     * Find a page by ID
     */
    findPage(pageId: string): Item | undefined {
        const len = this.items.length;
        for (let i = 0; i < len; i++) {
            const item = this.items.at(i);
            if (item && item.id === pageId) {
                return item;
            }
        }
        return undefined;
    }

    // Fluid compatible API: Add page (top-level item)
    addPage(title: string, author: string): Item {
        const page = this.items.addNode(author ?? "user");
        page.updateText(title ?? "");
        const pages = this.ydoc.getMap<Y.Doc>("pages");
        const subdoc = new Y.Doc({ guid: page.id, parent: this.ydoc } as any);
        subdoc.load();
        // Create a map to store page-specific items within the subdoc
        const pageItems = subdoc.getMap<any>("pageItems");
        pageItems.set("initialized", Date.now());
        pages.set(page.id, subdoc);
        return page;
    }

    /**
     * Get items for a specific page by page ID.
     * Handles items stored in the page subdocument's pageItems map.
     * Returns raw item data for use in merging/copying.
     */
    async getPageItems(pageId: string): Promise<Array<{ id: string; text: string; author: string; }>> {
        try {
            // First check if page exists
            const page = this.findPage(pageId);
            if (!page) {
                console.log(`[hydrate] Page ${pageId} not found in project tree`);
                return [];
            }

            // Try to get items from page subdoc's pageItems map
            const pages = this.ydoc.getMap<Y.Doc>("pages");
            const subdoc = pages.get(pageId);
            if (!subdoc) {
                console.log(`[hydrate] Subdoc not found for page ${pageId}`);
                return [];
            }

            // CRITICAL: Ensure subdoc is loaded before accessing its data
            // This is needed because subdocs may not be fully loaded when first accessed
            try {
                subdoc.load();
            } catch {
                // load() may fail if subdoc doesn't have persistence, continue anyway
            }

            const pageItems = subdoc.getMap<Y.Map<any>>("pageItems");
            let pageItemsSize = pageItems.size;

            // Wait for items to be available if subdoc just loaded
            let waitCount = 0;
            const maxWait = 100; // Increase to 10s for slow CI environments
            while (pageItemsSize <= 1 && waitCount < maxWait) { // <= 1 means only "initialized" key
                await new Promise(resolve => setTimeout(resolve, 100));
                const newSize = pageItems.size;
                if (newSize === pageItemsSize) {
                    // Size hasn't changed, no more items to wait for
                    break;
                }
                pageItemsSize = newSize;
                waitCount++;
            }

            const itemKeys = Array.from(pageItems.keys()).filter(k => k !== "initialized");
            console.log(
                `[hydrate] Page ${pageId}: pageItems.size=${pageItemsSize}, itemKeys=${itemKeys.length}, waitCount=${waitCount}`,
            );

            if (itemKeys.length === 0) {
                console.log(`[hydrate] No items in pageItems map for page ${pageId}`);
                return [];
            }

            return itemKeys.map(key => {
                const value = pageItems.get(key);
                if (!value) return null;
                return {
                    id: value.get("id") as string,
                    text: value.get("text") as string,
                    author: value.get("author") as string,
                };
            }).filter(Boolean) as Array<{ id: string; text: string; author: string; }>;
        } catch (e) {
            console.log(`[hydrate] Error getting page items for ${pageId}:`, e);
        }
        return [];
    }

    /**
     * Copy items from page subdoc's pageItems map to the page's items in the main tree.
     * This bridges the gap between how items are stored (in page subdoc) and how they're accessed (via page.items).
     */
    async hydratePageItems(pageId: string): Promise<void> {
        const pageItems = await this.getPageItems(pageId);
        const page = this.findPage(pageId);
        if (!page) {
            console.log(`[hydrate] Cannot hydrate: page ${pageId} not found`);
            return;
        }

        // Always attempt to hydrate items, even if page has no items yet
        if (pageItems.length === 0) {
            console.log(`[hydrate] No items to hydrate for page ${pageId}`);
            return;
        }

        // Get existing item IDs and texts for this page to avoid duplicates
        // Also track texts to catch duplicates even if IDs don't match
        const existingIds = new Set<string>();
        const existingTexts = new Set<string>();
        const pageItemsLen = page.items.length;
        for (let i = 0; i < pageItemsLen; i++) {
            const item = page.items.at(i);
            if (item) {
                existingIds.add(item.id);
                const text = item.text?.toString?.() ?? String(item.text ?? "");
                if (text) existingTexts.add(text);
            }
        }

        console.log(
            `[hydrate] Hydrating ${pageItems.length} items for page ${pageId}, existingIds=${existingIds.size}, existingTexts=${existingTexts.size}`,
        );

        // Add each item from pageItems to the page's items
        // Skip if ID already exists OR if text already exists (double protection against duplicates)
        let addedCount = 0;
        let skippedCount = 0;
        for (const itemData of pageItems) {
            // Skip if ID already exists
            if (existingIds.has(itemData.id)) {
                console.log(`[hydrate] Skipping item with existing ID: ${itemData.id}`);
                skippedCount++;
                continue;
            }
            // Also skip if text already exists (catch duplicates from different ID sources)
            if (existingTexts.has(itemData.text)) {
                console.log(`[hydrate] Skipping item with existing text: ${itemData.text}`);
                skippedCount++;
                continue;
            }
            const newItem = page.items.addNode(itemData.author);
            // The new item already has an empty text, we need to update it
            // Handle both Y.Text objects (from schema) and strings (from server seeding)
            const textValue = (newItem as any).value.get("text");
            if (textValue instanceof Y.Text) {
                // Normal case: text is a Y.Text object
                textValue.delete(0, textValue.length);
                if (itemData.text) {
                    textValue.insert(0, itemData.text);
                }
            } else if (typeof textValue === "string") {
                // Server seeding case: text is stored as a string
                // Replace the string with a proper Y.Text
                const newText = new Y.Text();
                if (itemData.text) {
                    newText.insert(0, itemData.text);
                }
                (newItem as any).value.set("text", newText);
            } else {
                // Fallback: try to use the value directly
                try {
                    const textField = textValue as Y.Text;
                    textField.delete(0, textField.length);
                    if (itemData.text) {
                        textField.insert(0, itemData.text);
                    }
                } catch {}
            }
            addedCount++;
        }
        console.log(`[hydrate] Added ${addedCount} items, skipped ${skippedCount} duplicates for page ${pageId}`);
    }

    /**
     * Get the keys of items that belong to a specific page (stored in main tree at root level).
     * This is a workaround for the schema issue where page items are stored at root level.
     */
    private getPageItemKeys(pageId: string): string[] {
        // In the current schema, page items are stored at the root level
        // We identify them by checking if they're near the page in the tree order
        // This is a temporary solution until the schema is fixed
        const keys: string[] = [];
        const len = this.items.length;
        for (let i = 0; i < len; i++) {
            const item = this.items.at(i);
            if (item && item.id !== pageId) {
                // In the current broken schema, all items are at root level
                // We can't easily distinguish page items from other items
                // For now, return all item IDs (this is a known limitation)
                keys.push(item.id);
            }
        }
        return keys;
    }
}

// Internal: Wrap Items with Proxy to enable array-like access
function wrapArrayLike(items: Items): Items {
    type PropertyKey = string | number | symbol;
    const isIndex = (p: PropertyKey): boolean => (typeof p === "number") || (typeof p === "string" && /^\d+$/.test(p));

    return new Proxy(items, {
        get(target, prop, receiver) {
            if (isIndex(prop)) {
                const idx = Number(prop);
                return target.at(idx);
            }
            if (prop === "length") return target.length;
            if (prop === Symbol.iterator) return target[Symbol.iterator].bind(target);
            return Reflect.get(target, prop, receiver);
        },
        has(target, prop) {
            if (isIndex(prop)) {
                const idx = Number(prop);
                return idx >= 0 && idx < target.length;
            }
            return Reflect.has(target, prop);
        },
        getOwnPropertyDescriptor(target, prop) {
            if (isIndex(prop)) {
                const idx = Number(prop);
                return {
                    configurable: true,
                    enumerable: true,
                    value: target.at(idx),
                    writable: false,
                };
            }
            if (prop === "length") {
                return {
                    configurable: true,
                    enumerable: false,
                    value: target.length,
                    writable: false,
                };
            }
            return Object.getOwnPropertyDescriptor(target, prop as keyof Items);
        },
    });
}
