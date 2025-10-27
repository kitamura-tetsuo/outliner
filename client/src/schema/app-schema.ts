// NOTE: Fluid Framework 実装は削除。Yjs + yjs-orderedtree 版のみ提供します。

import { v4 as uuid } from "uuid";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import type { CommentValueType, ItemValueType, PlainItemData, YDocOptions } from "../types/yjs-types";

export type Comment = {
    id: string;
    author: string;
    text: string;
    created: number;
    lastChanged: number;
};

// コメントコレクション（Y.Array<Y.Map>）用ラッパ
export class Comments {
    constructor(private readonly yArray: Y.Array<Y.Map<CommentValueType>>) {}

    addComment(author: string, text: string) {
        const time = Date.now();
        const c = new Y.Map<CommentValueType>();
        c.set("id", uuid());
        c.set("author", author);
        c.set("text", text);
        c.set("created", time);
        c.set("lastChanged", time);
        try {
            console.info("[Comments.addComment] pushing comment to Y.Array");
        } catch {}
        this.yArray.push([c]);
        try {
            console.info("[Comments.addComment] pushed. current length=", this.yArray.length);
        } catch {}
        return { id: c.get("id") as string };
    }

    deleteComment(commentId: string) {
        try {
            console.info("[Comments.deleteComment] called with id=", commentId);
        } catch {}
        const ids = this.yArray.toArray().map((m) => m.get("id"));
        try {
            console.info("[Comments.deleteComment] current ids=", ids);
        } catch {}
        const idx = ids.findIndex((id) => id === commentId);
        try {
            console.info("[Comments.deleteComment] found idx=", idx);
        } catch {}
        if (idx >= 0) {
            this.yArray.delete(idx, 1);
            try {
                console.info("[Comments.deleteComment] deleted idx=", idx);
            } catch {}
        } else {
            try {
                console.info("[Comments.deleteComment] not found, skip");
            } catch {}
        }
    }

    updateComment(commentId: string, text: string) {
        const m = this.yArray.toArray().find((m) => m.get("id") === commentId);
        if (m) {
            m.set("text", text);
            m.set("lastChanged", Date.now());
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

// 1ノード（アイテム）ラッパ
export class Item {
    constructor(
        public readonly ydoc: Y.Doc | PlainItemData,
        public readonly tree?: YTree,
        public readonly key?: string,
    ) {
        // Backward-compatible constructor: allow `new Item({ id, text, ... })` in tests
        if (arguments.length === 1 && this.tree === undefined && this.key === undefined) {
            const plain = this.ydoc as PlainItemData;
            // Initialize a fresh Y.Doc + YTree
            const doc = new Y.Doc();
            const ymap = doc.getMap("orderedTree");
            const tree = new YTree(ymap);

            const nodeKey = tree.generateNodeKey();
            const value = new Y.Map<ItemValueType>();

            // Map basic fields; prefer provided values with safe defaults
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
                // push expects an array of items
                votes.push(plain.votes as string[]);
            }
            value.set("votes", votes);

            value.set("attachments", new Y.Array<string>());
            value.set("comments", new Y.Array<Y.Map<CommentValueType>>());

            // Create the node under root and finalize fields on `this`
            tree.createNode("root", nodeKey, value);

            // Reassign instance fields to the initialized structures
            (this as { ydoc: Y.Doc; }).ydoc = doc;
            (this as { tree: YTree; }).tree = tree;
            (this as { key: string; }).key = nodeKey;
        } else {
            // Ensure required fields exist in normal constructor usage
            if (!(this.ydoc instanceof Y.Doc) || !(this.tree instanceof YTree) || typeof this.key !== "string") {
                throw new Error("Invalid Item constructor arguments");
            }
        }
    }

    private get value(): Y.Map<ItemValueType> {
        return this.tree!.getNodeValueFromKey(this.key!) as Y.Map<ItemValueType>;
    }

    get id(): string {
        return this.value.get("id");
    }
    set id(v: string) {
        this.value.set("id", v ?? "");
    }

    get author(): string {
        return this.value.get("author") ?? "";
    }

    get created(): number {
        return this.value.get("created") ?? 0;
    }

    get lastChanged(): number {
        return this.value.get("lastChanged") ?? 0;
    }

    get text(): string {
        const t = this.value.get("text") as Y.Text;
        return t ? t.toString() : "";
    }

    set text(v: string) {
        this.updateText(v ?? "");
    }

    // componentType stored in Y.Map ("table" | "chart" | undefined)
    get componentType(): string | undefined {
        return this.value.get("componentType");
    }
    set componentType(v: string | undefined) {
        this.value.set("componentType", v);
        this.value.set("lastChanged", Date.now());
    }

    // chart query stored in Y.Map
    get chartQuery(): string | undefined {
        return this.value.get("chartQuery");
    }
    set chartQuery(v: string | undefined) {
        this.value.set("chartQuery", v);
        this.value.set("lastChanged", Date.now());
    }

    // alias target id stored in Y.Map
    get aliasTargetId(): string | undefined {
        return this.value.get("aliasTargetId");
    }
    set aliasTargetId(v: string | undefined) {
        this.value.set("aliasTargetId", v);
        this.value.set("lastChanged", Date.now());
    }

    updateText(text: string) {
        const t = this.value.get("text") as Y.Text;
        t.delete(0, t.length);
        if (text) t.insert(0, text);
        this.value.set("lastChanged", Date.now());
    }

    get votes(): Y.Array<string> {
        return this.value.get("votes");
    }

    toggleVote(user: string) {
        const arr = this.votes;
        const idx = arr.toArray().indexOf(user);
        if (idx >= 0) arr.delete(idx, 1);
        else arr.push([user]);
        this.value.set("lastChanged", Date.now());
    }

    get attachments(): Y.Array<string> {
        let arr = this.value.get("attachments") as Y.Array<string> | undefined;
        if (!arr) {
            arr = new Y.Array<string>();
            this.value.set("attachments", arr);
        }
        return arr;
    }

    addAttachment(url: string) {
        // 1) もし現在の Item が仮Doc(接続前)で、接続後のDocが存在する場合は、対応するノードにも反映する
        try {
            interface WindowWithStore extends Window {
                generalStore?: {
                    currentPage?: Item;
                };
                __ITEM_ID_MAP__?: Record<string, string>;
                E2E_LOGS?: Array<{ tag: string; id: string; url: string; t: number; }>;
            }
            const w = (typeof window !== "undefined") ? (window as unknown as WindowWithStore) : null;
            const currentPage = w?.generalStore?.currentPage;
            const thisDoc = this.ydoc;
            const targetDoc = currentPage?.ydoc;
            if (currentPage && thisDoc && targetDoc && thisDoc !== targetDoc) {
                const items = currentPage.items;
                // 1) IDマップ経由で対応先を探す
                try {
                    const map = w?.__ITEM_ID_MAP__;
                    const mappedId = map ? map[String(this.id)] : undefined;
                    if (mappedId) {
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
                } catch (e) {
                    if (e instanceof Error && String(e.message) !== "__DONE__") {
                        // 2) フォールバック: テキスト一致
                        const text = this.text;
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
        } catch {}

        // 2) このノード自身にも通常通り追加
        const arr = this.attachments; // ensure exists
        try {
            console.debug("[Item.addAttachment] pushing url=", url, "id=", this.id);
        } catch {}
        try {
            interface WindowWithLogs extends Window {
                E2E_LOGS?: Array<{ tag: string; id: string; url: string; t: number; }>;
            }
            const w = (typeof window !== "undefined") ? (window as unknown as WindowWithLogs) : null;
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
        const arr = this.attachments;
        const idx = arr.toArray().indexOf(url);
        if (idx >= 0) arr.delete(idx, 1);
        this.value.set("lastChanged", Date.now());
    }

    get comments(): Comments {
        let arr = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>> | undefined;
        if (!arr) {
            arr = new Y.Array<Y.Map<CommentValueType>>();
            this.value.set("comments", arr);
        }
        return new Comments(arr);
    }

    addComment(author: string, text: string) {
        try {
            console.info("[Item.addComment] id=", this.id);
        } catch {}
        const res = this.comments.addComment(author, text);
        try {
            const arr = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>> | undefined;
            const len = arr?.length ?? 0;
            // Y.Map にプリミティブ数値をキャッシュして確実に反映させる
            this.value.set("commentCountCache", len);
            this.value.set("lastChanged", Date.now());
            // Window ブロードキャスト（UI への即時反映用・決定的）
            try {
                if (typeof window !== "undefined") {
                    console.info("[Item.addComment] dispatch item-comment-count id=", this.id, "count=", len);
                    window.dispatchEvent(
                        new CustomEvent("item-comment-count", { detail: { id: this.id, count: len } }),
                    );
                }
            } catch {}
        } catch {}
        return res;
    }

    deleteComment(commentId: string) {
        const res = this.comments.deleteComment(commentId);
        try {
            const arr = this.value.get("comments") as Y.Array<Y.Map<CommentValueType>> | undefined;
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
        return this.comments.updateComment(commentId, text);
    }

    get items(): Items {
        return wrapArrayLike(new Items(this.ydoc, this.tree!, this.key!));
    }

    // 親の子集合（Items）。ルート直下は null
    get parent(): Items | null {
        const parentKey = this.tree!.getNodeParentFromKey(this.key!);
        if (!parentKey) return null;
        return new Items(this.ydoc, this.tree!, parentKey);
    }

    // 親内でのインデックス（親がない場合は -1）
    indexInParent(): number {
        const p = this.parent;
        if (!p) return -1;
        return p.indexOf(this);
    }

    delete() {
        this.tree!.deleteNodeAndDescendants(this.key!);
    }
}

// 子ノード集合ラッパ
export class Items implements Iterable<Item> {
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

    [Symbol.iterator](): Iterator<Item> {
        let index = 0;
        return {
            next: (): IteratorResult<Item> => {
                const it = this.at(index++);
                if (it) return { value: it, done: false };
                return { value: undefined!, done: true };
            },
        };
    }

    indexOf(item: Item): number {
        return this.childrenKeys().indexOf(item.key!);
    }

    removeAt(index: number) {
        const key = this.childrenKeys()[index];
        if (key) this.tree.deleteNodeAndDescendants(key);
    }

    // 新規ノード作成。index 指定時は並び順を調整
    addNode(author: string, index?: number): Item {
        const nodeKey = this.tree.generateNodeKey();
        const now = Date.now();
        const existingKeys = this.childrenKeys();
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

// プロジェクト（Y.Doc）全体のラッパ
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
        return (this.ydoc.getMap("metadata").get("title") as string) ?? "";
    }

    set title(v: string) {
        this.ydoc.getMap("metadata").set("title", v);
    }

    // ルート直下のItems（親キー 'root'）
    get items(): Items {
        return wrapArrayLike(new Items(this.ydoc, this.tree, "root"));
    }

    // ページ（最上位アイテム）を追加し、textにタイトルを設定
    addPage(title: string, author: string) {
        const page = (this.items as Items).addNode(author);
        page.updateText(title);
        const pages = this.ydoc.getMap<Y.Doc>("pages");
        const subdoc = new Y.Doc({ guid: page.id, parent: this.ydoc } as YDocOptions);
        pages.set(page.id, subdoc);
        subdoc.load();
        return page;
    }
}

// Fluid 実装は削除済み。互換のためのスタブのみ残す。
export const appTreeConfiguration: undefined = undefined;

// 内部: Items を配列風アクセス可能にする Proxy でラップ
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
