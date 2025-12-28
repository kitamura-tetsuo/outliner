// Minimal Yjs-based schema wrappers for yjsService and tests

import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";

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
        this.value.set("aliasTargetId", value);
    }

    updateText(text: string) {
        const t = this.text;
        t.delete(0, t.length);
        if (text) t.insert(0, text);
        this.value.set("lastChanged", Date.now());
    }

    // 添付ファイル: Y.Array<string> を保証して返す
    get attachments(): Y.Array<string> {
        let arr = this.value.get("attachments") as Y.Array<string> | undefined;
        if (!arr) {
            arr = new Y.Array<string>();
            this.value.set("attachments", arr);
        }
        return arr;
    }

    // 添付を追加（重複は無視）。テスト同期用に CustomEvent も発火
    addAttachment(url: string) {
        const arr = this.attachments;
        if (!arr.toArray().includes(url)) {
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

    // 添付を削除
    removeAttachment(url: string) {
        const arr = this.attachments;
        const idx = arr.toArray().indexOf(url);
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

    get items(): Items {
        return new Items(this.ydoc, this.tree, this.key);
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
        return new Items(this.ydoc, this.tree, "root");
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

    // Fluid互換API: ページ（最上位アイテム）を追加
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
            const maxWait = 10;
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

        // Get existing item IDs for this page to avoid duplicates
        // Note: In the current schema, page items are stored at root level, but we can
        // still check if items with matching IDs already exist
        const existingIds = new Set<string>();
        const pageItemsLen = page.items.length;
        for (let i = 0; i < pageItemsLen; i++) {
            const item = page.items.at(i);
            if (item) {
                existingIds.add(item.id);
            }
        }

        console.log(
            `[hydrate] Hydrating ${pageItems.length} items for page ${pageId}, existingIds=${existingIds.size}`,
        );

        // Add each item from pageItems to the page's items
        let addedCount = 0;
        for (const itemData of pageItems) {
            if (!existingIds.has(itemData.id)) {
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
        }
        console.log(`[hydrate] Added ${addedCount} items for page ${pageId}`);
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
