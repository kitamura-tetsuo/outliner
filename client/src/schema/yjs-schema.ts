// Minimal Yjs-based schema wrappers for yjsService and tests

import { v4 as uuid } from "uuid";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { getLogger } from "../lib/logger";
import { safeGetNodeParent } from "../utils/treeUtils";

const logger = getLogger("yjs-schema");

const DUMMY_DOC = new Y.Doc();
const DUMMY_MAP = DUMMY_DOC.getMap<unknown>("dummy");

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

    observe(
        f: (
            event: import("yjs").YArrayEvent<import("yjs").Map<CommentValueType>>,
            transaction: import("yjs").Transaction,
        ) => void,
    ) {
        this.yArray.observe(f);
    }

    unobserve(
        f: (
            event: import("yjs").YArrayEvent<import("yjs").Map<CommentValueType>>,
            transaction: import("yjs").Transaction,
        ) => void,
    ) {
        this.yArray.unobserve(f);
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

        return { id: id };
    }

    deleteComment(commentId: string) {
        const ids = this.yArray.toArray().map((m) => m.get("id"));
        const idx = ids.findIndex((id) => id === commentId);

        if (idx >= 0) {
            this.yArray.delete(idx, 1);
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

    private get value(): Y.Map<unknown> {
        try {
            return this.tree.getNodeValueFromKey(this.key) as Y.Map<unknown>;
        } catch {
            return DUMMY_MAP;
        }
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

    get preview(): { lines: string[]; image: string | null; } | undefined {
        return this.value.get("preview") as { lines: string[]; image: string | null; } | undefined;
    }

    set preview(value: { lines: string[]; image: string | null; } | undefined) {
        if (value === undefined) {
            this.value.delete("preview");
        } else {
            this.value.set("preview", value);
        }
    }

    insertTextAt(offset: number, text: string) {
        const t = this.text;
        if (t && text) {
            this.ydoc.transact(() => {
                t.insert(offset, text);
                this.value.set("lastChanged", Date.now());
            });
        }
    }

    deleteTextAt(offset: number, length: number) {
        const t = this.text;
        if (t && length > 0) {
            this.ydoc.transact(() => {
                t.delete(offset, length);
                this.value.set("lastChanged", Date.now());
            });
        }
    }

    updateText(text: string) {
        const t = this.text;
        if (t) {
            const current = t.toString();
            if (current === text) return;

            let start = 0;
            while (start < current.length && start < text.length && current[start] === text[start]) {
                start++;
            }

            let end = 0;
            while (
                end < current.length - start
                && end < text.length - start
                && current[current.length - 1 - end] === text[text.length - 1 - end]
            ) {
                end++;
            }

            const deleteLen = current.length - start - end;
            const insertStr = text.slice(start, text.length - end);

            this.ydoc.transact(() => {
                if (deleteLen > 0) {
                    t.delete(start, deleteLen);
                }
                if (insertStr.length > 0) {
                    t.insert(start, insertStr);
                }
                this.value.set("lastChanged", Date.now());
            });
        }
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
        if (
            (url.startsWith("blob:") || url.startsWith("data:"))
            && !(typeof window !== "undefined" && (window as Window & { __E2E__?: boolean; }).__E2E__)
        ) {
            throw new Error("Invalid attachment URL");
        }
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

    get votes(): Y.Array<string> {
        let arr = this.value.get("votes") as Y.Array<string> | undefined;
        if (!arr) {
            arr = new Y.Array<string>();
            this.value.set("votes", arr);
        }
        return arr;
    }

    toggleVote(user: string) {
        const arr = this.votes;
        const existing = arr.toArray();
        const idx = existing.indexOf(user);
        if (idx >= 0) {
            arr.delete(idx, 1);
        } else {
            arr.push([user]);
        }
        const current = this.value.get("lastChanged") as number || 0;
        this.value.set("lastChanged", Math.max(Date.now(), current + 1));
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
        const parentKey = safeGetNodeParent(this.tree, this.key);
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
        try {
            if (this.tree.computedMap && !this.tree.computedMap.has(this.parentKey)) return [];
            if (typeof this.tree.hasNode === "function" && !this.tree.hasNode(this.parentKey)) return [];
            const children = this.tree.getNodeChildrenFromKey(this.parentKey);
            return this.tree.sortChildrenByOrder(children, this.parentKey);
        } catch (_e) {
            // Handle missing root node gracefully during initial sync/loading
            if (this.parentKey === "root") {
                return [];
            }
            // Catch missing nodes due to race conditions
            // Silent warning: parent node was deleted
            return [];
        }
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

        const value = new Y.Map<unknown>();
        value.set("id", nodeKey);
        value.set("author", author);
        value.set("created", now);
        value.set("lastChanged", now);
        value.set("componentType", undefined);
        value.set("aliasTargetId", undefined);
        value.set("text", new Y.Text());
        value.set("votes", new Y.Array<string>());
        value.set("attachments", new Y.Array<string>());
        value.set("comments", new Y.Array<Y.Map<unknown>>());

        this.tree.createNode(this.parentKey, nodeKey, value);

        if (
            typeof (this.tree as unknown as { recomputeParentsAndChildren?: () => void; }).recomputeParentsAndChildren
                === "function"
        ) {
            (this.tree as unknown as { recomputeParentsAndChildren: () => void; }).recomputeParentsAndChildren();
        }

        if (index === undefined) {
            this.tree.setNodeOrderToEnd(nodeKey);
        } else {
            const keys = this.childrenKeys();
            const clamped = Math.max(0, Math.min(index, keys.length));
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
        if (this.tree.computedMap && !this.tree.computedMap.has(this.parentKey)) return;
        if (typeof this.tree.hasNode === "function" && !this.tree.hasNode(this.parentKey)) return;
        let keys: string[];
        try {
            keys = this.tree.getNodeChildrenFromKey(this.parentKey);
        } catch (e) {
            if (!(e instanceof Error && e.message.includes("does not exist"))) {
                logger.warn(
                    { parentKey: this.parentKey, error: e },
                    "[yjs-schema] Items.iterateUnordered error fetching children for parentKey",
                );
            }
            return;
        }
        for (const key of keys) {
            if (this.tree.computedMap && !this.tree.computedMap.has(key)) continue;
            if (typeof this.tree.hasNode === "function" && !this.tree.hasNode(key)) continue;
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
            const meta = this.ydoc.getMap("metadata") as Y.Map<unknown>;
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
        return page;
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
