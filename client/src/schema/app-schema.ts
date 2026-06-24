// NOTE: Fluid Framework implementation removed. Providing only Yjs + yjs-orderedtree version.

import { v4 as uuid } from "uuid";
import { getLogger } from "../lib/logger";
const logger = getLogger("AppSchema");
import * as Y from "yjs";

// A dummy Y.Array-like object to return for empty collections without mutating the document or causing Yjs warnings about unattached types.
class EmptyYArray {
    get length() {
        return 0;
    }
    toArray() {
        return [];
    }
    push() {
        throw new Error("Cannot mutate empty Y.Array stub");
    }
    delete() {
        throw new Error("Cannot mutate empty Y.Array stub");
    }
    insert() {
        throw new Error("Cannot mutate empty Y.Array stub");
    }
    get() {
        return undefined;
    }
    observe() {}
    unobserve() {}
    observeDeep() {}
    unobserveDeep() {}
    [Symbol.iterator]() {
        return [][Symbol.iterator]();
    }
}
const EMPTY_Y_ARRAY = new EmptyYArray() as unknown as Y.Array<unknown>;

import { YTree } from "yjs-orderedtree";
import type { CommentValueType, ItemValueType, PlainItemData, RowValueType, YDocOptions } from "../types/yjs-types.js";

export type Comment = {
    id: string;
    author: string;
    text: string;
    created: number;
    lastChanged: number;
};

// Wrapper for comment collection (Y.Array<Y.Map>)
export class Comments {
    private yArray: Y.Array<Y.Map<CommentValueType>>;
    private _ensureInitialized?: () => Y.Array<Y.Map<CommentValueType>>;
    constructor(yArray: Y.Array<Y.Map<CommentValueType>>, ensureInitialized?: () => Y.Array<Y.Map<CommentValueType>>) {
        this.yArray = yArray;
        this._ensureInitialized = ensureInitialized;
    }

    addComment(author: string, text: string) {
        const time = Date.now();
        const c = new Y.Map<CommentValueType>();
        c.set("id", uuid());
        c.set("author", author);
        c.set("text", text);
        c.set("created", time);
        c.set("lastChanged", time);
        try {
            logger.info("[Comments.addComment] pushing comment to Y.Array");
        } catch {}
        if (this._ensureInitialized) {
            this.yArray = this._ensureInitialized();
        }
        this.yArray.push([c]);
        try {
            logger.info("[Comments.addComment] pushed. current length=", this.yArray.length);
        } catch {}
        return { id: c.get("id") as string };
    }

    deleteComment(commentId: string) {
        if (this._ensureInitialized) {
            this.yArray = this._ensureInitialized();
        }
        let idx = 0;
        for (const m of this.yArray) {
            if (m.get("id") === commentId) {
                this.yArray.delete(idx, 1);
                return;
            }
            idx++;
        }
    }

    updateComment(commentId: string, text: string) {
        for (const m of this.yArray) {
            if (m.get("id") === commentId) {
                m.set("text", text);
                m.set("lastChanged", Date.now());
                return;
            }
        }
    }

    get length() {
        return this.yArray.length;
    }

    toArray(): Y.Map<CommentValueType>[] {
        return this.yArray.toArray();
    }

    toPlain(): Comment[] {
        return this.yArray.toArray().map((m) => ({
            id: m.get("id") as string,
            author: m.get("author") as string,
            text: m.get("text") as string,
            created: m.get("created") as number,
            lastChanged: m.get("lastChanged") as number,
        }));
    }

    [Symbol.iterator](): Iterator<Comment> {
        const arr = this.toPlain();
        return arr[Symbol.iterator]();
    }
}

// Wrapper for the editable rows of a SQL-defined table (Y.Array<Y.Map<string>>).
// Each row is a Y.Map keyed by column name so that concurrent edits to
// different cells merge cleanly (cell-level CRDT granularity).
export class TableRows {
    private yArray: Y.Array<Y.Map<RowValueType>>;
    private _ensureInitialized?: () => Y.Array<Y.Map<RowValueType>>;
    constructor(yArray: Y.Array<Y.Map<RowValueType>>, ensureInitialized?: () => Y.Array<Y.Map<RowValueType>>) {
        this.yArray = yArray;
        this._ensureInitialized = ensureInitialized;
    }

    get length() {
        return this.yArray.length;
    }

    /** Append a row, optionally seeded with values keyed by column name. */
    addRow(values: Record<string, string> = {}): void {
        const row = new Y.Map<RowValueType>();
        for (const [key, value] of Object.entries(values)) {
            row.set(key, value);
        }
        if (this._ensureInitialized) {
            this.yArray = this._ensureInitialized();
        }
        this.yArray.push([row]);
    }

    /** Set a single cell value. No-op when the row index is out of range. */
    updateCell(rowIndex: number, column: string, value: string): void {
        if (this._ensureInitialized) {
            this.yArray = this._ensureInitialized();
        }
        const row = this.yArray.get(rowIndex);
        if (row) row.set(column, value);
    }

    deleteRow(rowIndex: number): void {
        if (this._ensureInitialized) {
            this.yArray = this._ensureInitialized();
        }
        if (rowIndex >= 0 && rowIndex < this.yArray.length) {
            this.yArray.delete(rowIndex, 1);
        }
    }

    toArray(): Y.Array<Y.Map<RowValueType>> {
        return this.yArray;
    }

    /** Plain snapshot of every row keyed by column name. */
    toPlain(columns: string[]): Record<string, string>[] {
        return this.yArray.toArray().map((row) => {
            const obj: Record<string, string> = {};
            for (const col of columns) {
                const v = row.get(col);
                obj[col] = v === undefined || v === null ? "" : String(v);
            }
            return obj;
        });
    }
}

// Wrapper for one node (item)
export class Item {
    public readonly ydoc: Y.Doc;
    public readonly tree: YTree;
    public readonly key: string;

    constructor(plain: PlainItemData);
    constructor(ydoc: Y.Doc, tree: YTree, key: string);
    constructor(docOrPlain: Y.Doc | PlainItemData, tree?: YTree, key?: string) {
        // Backward-compatible constructor: allow `new Item({ id, text, ... })` in tests
        if (!(docOrPlain instanceof Y.Doc)) {
            const plain = docOrPlain;
            const doc = new Y.Doc();
            const ymap = doc.getMap("orderedTree");
            const nextTree = new YTree(ymap);

            const nodeKey = nextTree.generateNodeKey();
            const value = new Y.Map<ItemValueType>();

            value.set("id", plain?.id ?? nodeKey);
            value.set("author", plain?.author ?? "");
            value.set("created", plain?.created ?? 0);
            value.set("lastChanged", plain?.lastChanged ?? 0);
            value.set("componentType", undefined);
            value.set("chartQuery", undefined);
            value.set("aliasTargetId", undefined);

            const text = new Y.Text();
            const srcText = typeof plain?.text === "string" ? plain.text : "";
            if (srcText) text.insert(0, srcText);
            value.set("text", text);

            const votes = new Y.Array<string>();
            if (Array.isArray(plain?.votes) && plain.votes.length > 0) {
                votes.push(plain.votes as string[]);
            }
            value.set("votes", votes);

            value.set("attachments", new Y.Array<string>());
            value.set("comments", new Y.Array<Y.Map<CommentValueType>>());

            nextTree.createNode("root", nodeKey, value);

            this.ydoc = doc;
            this.tree = nextTree;
            this.key = nodeKey;
            return;
        }

        if (!(tree instanceof YTree) || typeof key !== "string") {
            throw new Error("Invalid Item constructor arguments");
        }

        this.ydoc = docOrPlain;
        this.tree = tree;
        this.key = key;
    }

    private get value(): Y.Map<ItemValueType> {
        try {
            return this.tree.getNodeValueFromKey(this.key) as Y.Map<ItemValueType>;
        } catch {
            return {
                get: () => null,
                set: () => {},
                observeDeep: () => {},
                unobserveDeep: () => {},
                observe: () => {},
                unobserve: () => {},
                delete: () => {},
                has: () => false,
                toJSON: () => ({}),
            } as unknown as Y.Map<ItemValueType>;
        }
    }

    get id(): string {
        return (this.value.get("id") as string) ?? "";
    }
    set id(v: string) {
        this.value.set("id", v ?? "");
    }

    get author(): string {
        return (this.value.get("author") as string) ?? "";
    }

    get created(): number {
        return (this.value.get("created") as number) ?? 0;
    }

    get lastChanged(): number {
        return (this.value.get("lastChanged") as number) ?? 0;
    }

    get text(): string {
        const t = this.value.get("text");
        if (t === undefined || t === null) return "";
        if (typeof (t as { toString?: () => string; }).toString === "function") {
            return (t as { toString: () => string; }).toString();
        }
        return String(t);
    }

    set text(v: string) {
        this.updateText(v ?? "");
    }

    // componentType stored in Y.Map ("table" | "chart" | undefined)
    get componentType(): string | undefined {
        return this.value.get("componentType") as string | undefined;
    }
    set componentType(v: string | undefined) {
        this.value.set("componentType", v);
        this.value.set("lastChanged", Date.now());
    }

    // chart query stored in Y.Map
    get chartQuery(): string | undefined {
        return this.value.get("chartQuery") as string | undefined;
    }
    set chartQuery(v: string | undefined) {
        this.value.set("chartQuery", v);
        this.value.set("lastChanged", Date.now());
    }

    // SQL CREATE TABLE statement that defines this item's embedded table.
    get tableSchema(): string | undefined {
        return this.value.get("tableSchema") as string | undefined;
    }
    set tableSchema(v: string | undefined) {
        this.value.set("tableSchema", v);
        this.value.set("lastChanged", Date.now());
    }

    // Column names derived from the CREATE TABLE statement, cached as JSON so the
    // grid keeps a stable column order independent of row contents.
    get tableColumns(): string[] {
        const raw = this.value.get("tableColumns") as string | undefined;
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as string[]) : [];
        } catch {
            return [];
        }
    }
    set tableColumns(v: string[]) {
        this.value.set("tableColumns", JSON.stringify(v ?? []));
        this.value.set("lastChanged", Date.now());
    }

    // Editable rows for the embedded SQL table (lazily created Y.Array<Y.Map>).
    get tableRows(): TableRows {
        let arr = this.value.get("tableRows") as Y.Array<Y.Map<RowValueType>> | undefined;
        if (!arr) {
            arr = EMPTY_Y_ARRAY as unknown as Y.Array<Y.Map<RowValueType>>;
            return new TableRows(arr, () => {
                let actual = this.value.get("tableRows") as Y.Array<Y.Map<RowValueType>> | undefined;
                if (!actual) {
                    actual = new Y.Array<Y.Map<RowValueType>>();
                    this.value.set("tableRows", actual);
                }
                return actual;
            });
        }
        return new TableRows(arr);
    }

    // Replace the whole table definition: persist the SQL, the derived column
    // order, and reset the rows so the grid starts empty for the new schema.
    defineTable(sql: string, columns: string[]): void {
        this.tableSchema = sql;
        this.tableColumns = columns;
        const arr = this.value.get("tableRows") as Y.Array<Y.Map<RowValueType>> | undefined;
        if (arr && arr.length > 0) arr.delete(0, arr.length);
    }

    // alias target id stored in Y.Map
    get aliasTargetId(): string | undefined {
        return this.value.get("aliasTargetId") as string | undefined;
    }
    set aliasTargetId(v: string | undefined) {
        this.value.set("aliasTargetId", v);
        this.value.set("lastChanged", Date.now());
    }

    // cached page preview stored in Y.Map
    get preview(): { lines: string[]; image: string | null; } | undefined {
        return this.value.get("preview") as { lines: string[]; image: string | null; } | undefined;
    }
    set preview(v: { lines: string[]; image: string | null; } | undefined) {
        if (v === undefined) this.value.delete("preview");
        else this.value.set("preview", v as unknown as ItemValueType);
    }

    updateText(text: string) {
        const t = this.value.get("text") as Y.Text;
        t.delete(0, t.length);
        if (text) t.insert(0, text);
        this.value.set("lastChanged", Date.now());
    }

    get votes(): Y.Array<string> {
        let arr = this.value.get("votes") as Y.Array<string> | undefined;
        if (!arr) {
            arr = EMPTY_Y_ARRAY as unknown as Y.Array<string>;
        }
        return arr;
    }

    toggleVote(user: string) {
        let arr = this.value.get("votes") as Y.Array<string> | undefined;
        if (!arr) {
            arr = new Y.Array<string>();
            this.value.set("votes", arr);
        }
        const idx = arr.toArray().indexOf(user);
        if (idx >= 0) arr.delete(idx, 1);
        else arr.push([user]);
        this.value.set("lastChanged", Date.now());
    }

    get attachments(): Y.Array<string> {
        let arr = this.value.get("attachments") as Y.Array<string> | undefined;
        if (!arr) {
            arr = EMPTY_Y_ARRAY as unknown as Y.Array<string>;
        }
        return arr;
    }

    addAttachment(url: string) {
        // 1) If the current Item is a temporary Doc (before connection) and a connected Doc exists, reflect it in the corresponding node as well
        try {
            const w = (typeof window !== "undefined") ? window : null;
            const currentPage = w?.generalStore?.currentPage;
            const thisDoc = this.ydoc;
            const targetDoc = currentPage?.ydoc;
            if (currentPage && thisDoc && targetDoc && thisDoc !== targetDoc) {
                const items = currentPage.items;
                // 1) Search for the corresponding destination via ID map
                try {
                    const map = w?.__ITEM_ID_MAP__;
                    const mappedId = map ? map[String(this.id)] : undefined;
                    if (mappedId) {
                        const iter = (items as unknown as { iterateUnordered?: () => IterableIterator<Item>; })
                            ?.iterateUnordered;
                        if (typeof iter === "function") {
                            for (const cand of iter.call(items)) {
                                if (cand && String(cand.id) === String(mappedId)) {
                                    try {
                                        cand.addAttachment(url);
                                    } catch {}
                                    throw new Error("__DONE__");
                                }
                            }
                        } else {
                            const len = items?.length ?? 0;
                            for (let i = 0; i < len; i++) {
                                const cand = items.at(i);
                                if (cand && String(cand.id) === String(mappedId)) {
                                    try {
                                        cand.addAttachment(url);
                                    } catch {}
                                    throw new Error("__DONE__");
                                }
                            }
                        }
                    }
                } catch (e) {
                    if (e instanceof Error && String(e.message) !== "__DONE__") {
                        // 2) Fallback: text match
                        const text = this.text;
                        const iter = (items as unknown as { iterateUnordered?: () => IterableIterator<Item>; })
                            ?.iterateUnordered;
                        if (typeof iter === "function") {
                            for (const cand of iter.call(items)) {
                                if (cand) {
                                    const ct = cand.text;
                                    if (ct === text) {
                                        try {
                                            cand.addAttachment(url);
                                        } catch {}
                                        break;
                                    }
                                }
                            }
                        } else {
                            const len2 = items?.length ?? 0;
                            for (let i = 0; i < len2; i++) {
                                const cand = items.at(i);
                                if (cand) {
                                    const ct = cand.text;
                                    if (ct === text) {
                                        try {
                                            cand.addAttachment(url);
                                        } catch {}
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch {}

        // 2) Add to this node itself as usual
        let arr = this.value.get("attachments") as Y.Array<string> | undefined;
        if (!arr) {
            arr = new Y.Array<string>();
            this.value.set("attachments", arr);
        }
        try {
            logger.debug({ url, id: this.id }, "[Item.addAttachment] pushing url");
        } catch {}
        try {
            const w = (typeof window !== "undefined") ? window : null;
            if (w) {
                w.E2E_LOGS = Array.isArray(w.E2E_LOGS) ? w.E2E_LOGS : [];
                w.E2E_LOGS.push({ tag: "add-attachment", id: this.id, url, t: Date.now() });
            }
        } catch {}
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

    removeAttachment(url: string) {
        const arr = this.value.get("attachments") as Y.Array<string> | undefined;
        if (!arr) return;
        const idx = arr.toArray().indexOf(url);
        if (idx >= 0) arr.delete(idx, 1);
        this.value.set("lastChanged", Date.now());
    }

    removeComment(commentId: string) {
        this.deleteComment(commentId);
    }

    get comments(): Comments {
        let arr = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>> | undefined;
        if (!arr) {
            arr = EMPTY_Y_ARRAY as unknown as Y.Array<Y.Map<CommentValueType>>;
            return new Comments(arr, () => {
                let actual = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>> | undefined;
                if (!actual) {
                    actual = new Y.Array<Y.Map<CommentValueType>>();
                    this.value.set("comments", actual);
                }
                return actual;
            });
        }
        return new Comments(arr);
    }

    addComment(author: string, text: string) {
        try {
            logger.info("[Item.addComment] id=", this.id);
        } catch {}
        let arr = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>> | undefined;
        if (!arr) {
            arr = new Y.Array<Y.Map<CommentValueType>>();
            this.value.set("comments", arr);
        }
        const comments = new Comments(arr);
        const res = comments.addComment(author, text);
        try {
            const len = arr?.length ?? 0;
            // Cache primitive numeric value in Y.Map to ensure reflection
            this.value.set("commentCountCache", len);
            this.value.set("lastChanged", Date.now());
            // Window broadcast (for immediate UI reflection, deterministic)
            try {
                if (typeof window !== "undefined") {
                    logger.info("[Item.addComment] dispatch item-comment-count id=", this.id, "count=", len);
                    window.dispatchEvent(
                        new CustomEvent("item-comment-count", { detail: { id: this.id, count: len } }),
                    );
                }
            } catch {}
        } catch {}
        return res;
    }

    deleteComment(commentId: string) {
        const arr = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>> | undefined;
        if (!arr) return;
        const comments = new Comments(arr);
        const res = comments.deleteComment(commentId);
        try {
            const len = arr?.length ?? 0;
            this.value.set("commentCountCache", len);
            this.value.set("lastChanged", Date.now());
            try {
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("item-comment-count", { detail: { id: this.id, count: len } }),
                    );
                }
            } catch {}
        } catch {}
        return res;
    }

    updateComment(commentId: string, text: string) {
        const arr = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>> | undefined;
        if (!arr) return;
        const comments = new Comments(arr);
        return comments.updateComment(commentId, text);
    }

    get items(): Items {
        return wrapArrayLike(new Items(this.ydoc, this.tree, this.key));
    }

    // Parent's children collection (Items). null directly under root
    get parent(): Items | null {
        const parentKey = this.tree.getNodeParentFromKey(this.key);
        if (!parentKey) return null;
        return new Items(this.ydoc, this.tree, parentKey);
    }

    // Index within parent (-1 if no parent)
    indexInParent(): number {
        const p = this.parent;
        if (!p) return -1;
        return p.indexOf(this);
    }

    delete() {
        this.tree.deleteNodeAndDescendants(this.key);
    }
}

// Child node collection wrapper
export class Items implements Iterable<Item> {
    public readonly ydoc: Y.Doc;
    public readonly tree: YTree;
    public readonly parentKey: string;
    constructor(
        ydoc: Y.Doc,
        tree: YTree,
        parentKey: string,
    ) {
        this.ydoc = ydoc;
        this.tree = tree;
        this.parentKey = parentKey;
    }

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

    [Symbol.iterator](): Iterator<Item> {
        const keys = this.childrenKeys();
        let index = 0;
        return {
            next: (): IteratorResult<Item> => {
                if (index < keys.length) {
                    const key = keys[index++];
                    return { value: new Item(this.ydoc, this.tree, key), done: false };
                }
                return { value: undefined!, done: true };
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

    indexOf(item: Item): number {
        return this.childrenKeys().indexOf(item.key!);
    }

    removeAt(index: number) {
        const key = this.childrenKeys()[index];
        if (key) this.tree.deleteNodeAndDescendants(key);
    }

    // Create new node. Adjust order when index is specified
    addNode(author: string, index?: number): Item {
        const nodeKey = this.tree.generateNodeKey();
        const now = Date.now();

        const value = new Y.Map<ItemValueType>();
        value.set("id", nodeKey);
        value.set("author", author);
        value.set("created", now);
        value.set("lastChanged", now);
        value.set("componentType", undefined);
        value.set("chartQuery", undefined);
        value.set("aliasTargetId", undefined);
        value.set("text", new Y.Text());
        value.set("votes", new Y.Array<string>());
        value.set("attachments", new Y.Array<string>());
        value.set("comments", new Y.Array<Y.Map<CommentValueType>>());

        this.tree.createNode(this.parentKey, nodeKey, value);

        if (index === undefined) {
            this.tree.setNodeOrderToEnd(nodeKey);
        } else {
            // Lazy load keys only when index insertion is needed
            // This prevents O(N^2) complexity during bulk appends where index is undefined
            const existingKeys = this.childrenKeys();
            const normalized = Math.max(0, index);

            if (existingKeys.length === 0) {
                this.tree.setNodeOrderToEnd(nodeKey);
            } else if (normalized <= 0) {
                this.tree.setNodeBefore(nodeKey, existingKeys[0]!);
            } else if (normalized >= existingKeys.length) {
                this.tree.setNodeOrderToEnd(nodeKey);
            } else {
                this.tree.setNodeAfter(nodeKey, existingKeys[normalized - 1]!);
            }
        }

        return new Item(this.ydoc, this.tree, nodeKey);
    }

    addAlias(targetId: string, author: string, index?: number): Item {
        const it = this.addNode(author, index);
        // Access the private value property through the Item instance
        it.aliasTargetId = targetId;
        return it;
    }
}

// Wrapper for the entire project (Y.Doc)
export class Project {
    public readonly ydoc: Y.Doc;
    public readonly tree: YTree;
    constructor(ydoc: Y.Doc, tree: YTree) {
        this.ydoc = ydoc;
        this.tree = tree;
    }

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
        return (this.ydoc.getMap("metadata").get("title") as string) ?? "";
    }

    set title(v: string) {
        this.ydoc.getMap("metadata").set("title", v);
    }

    // Items directly under root (parent key 'root')
    get items(): Items {
        return wrapArrayLike(new Items(this.ydoc, this.tree, "root"));
    }

    /**
     * Find a page by ID
     */
    findPage(pageId: string): Item | undefined {
        const items = this.items as Items;
        if (typeof items.iterateUnordered === "function") {
            for (const item of items.iterateUnordered()) {
                if (item && item.id === pageId) {
                    return item;
                }
            }
        } else {
            const len = items.length;
            for (let i = 0; i < len; i++) {
                const item = items.at(i);
                if (item && item.id === pageId) {
                    return item;
                }
            }
        }
        return undefined;
    }

    // Add page (top-level item) and set title in text
    addPage(title: string, author: string) {
        const page = (this.items as Items).addNode(author);
        page.updateText(title);
        return page;
    }
}

// Fluid implementation has been removed. Only stubs remain for compatibility.
export const appTreeConfiguration: undefined = undefined;

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
export type { YDocOptions };
