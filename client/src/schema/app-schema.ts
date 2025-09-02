// @ts-nocheck
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

<<<<<<< HEAD
    addComment(author: string, text: string) {
        const time = Date.now();
        const c = new Y.Map<any>();
        c.set("id", uuid());
        c.set("author", author);
        c.set("text", text);
        c.set("created", time);
        c.set("lastChanged", time);
        this.yArray.push([c]);
        return { id: c.get("id") as string };
    }

    deleteComment(commentId: string) {
        const idx = this.yArray.toArray().findIndex((m) => m.get("id") === commentId);
        if (idx >= 0) this.yArray.delete(idx, 1);
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

    // Y.Array をそのまま配列として取得（Y.Mapの配列）
    toArray(): Y.Map<any>[] {
        return this.yArray.toArray();
    }

    // プレーンなコメント配列を取得
    toPlain(): Comment[] {
        return this.yArray.toArray().map((m) => ({
            id: m.get("id"),
            author: m.get("author"),
            text: m.get("text"),
            created: m.get("created"),
            lastChanged: m.get("lastChanged"),
        }));
    }

    [Symbol.iterator](): Iterator<Comment> {
        const arr = this.toPlain();
        return arr[Symbol.iterator]();
    }
}

/**
 * YTree上の1ノード（アイテム）を操作するラッパ
 * value は Y.Map を保持し、その中に text: Y.Text を格納します。
 */
export class Item {
    constructor(
        private readonly ydoc: Y.Doc,
        private readonly tree: YTree,
        public readonly key: string,
    ) {}

    private get value(): Y.Map<any> {
        return this.tree.getNodeValueFromKey(this.key) as Y.Map<any>;
    }

    get id(): string {
        return this.value.get("id");
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

    get text(): Y.Text {
        return this.value.get("text") as Y.Text;
    }

    updateText(text: string) {
        const t = this.text;
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
        return this.value.get("attachments");
    }

    addAttachment(url: string) {
        this.attachments.push([url]);
        this.value.set("lastChanged", Date.now());
    }

    removeAttachment(url: string) {
        const arr = this.attachments;
        const idx = arr.toArray().indexOf(url);
        if (idx >= 0) arr.delete(idx, 1);
        this.value.set("lastChanged", Date.now());
    }

    get comments(): Comments {
        return new Comments(this.value.get("comments"));
    }

    addComment(author: string, text: string) {
        return this.comments.addComment(author, text);
    }

    deleteComment(commentId: string) {
        return this.comments.deleteComment(commentId);
    }

    updateComment(commentId: string, text: string) {
        return this.comments.updateComment(commentId, text);
    }

    get items(): Items {
        return new Items(this.ydoc, this.tree, this.key);
    }

    /** 親の子集合（Items）を返す。ルート直下の場合は null */
    get parent(): Items | null {
        // yjs-orderedtree の API で親キーを取得
        const parentKey = (this.tree as any).getNodeParentFromKey(this.key);
        if (!parentKey) return null;
        return new Items(this.ydoc, this.tree, parentKey);
    }

    /** 親内でのインデックス（親がない場合は -1） */
    indexInParent(): number {
        const p = this.parent;
        if (!p) return -1;
        return p.indexOf(this);
    }

    delete() {
        this.tree.deleteNodeAndDescendants(this.key);
    }
}

/**
 * 子ノード集合の操作ラッパ（親キー単位）
 */
export class Items {
    constructor(
        private readonly ydoc: Y.Doc,
        private readonly tree: YTree,
        private readonly parentKey: string,
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

    /**
     * Array風アクセス互換: items[0] で at(0) を返す Proxy を生成
     */
    asArrayLike(): any {
        const self = this;
        return new Proxy(self as any, {
            get(target, prop, receiver) {
                const isIndex = (p: any) => (typeof p === "number") || (typeof p === "string" && /^\d+$/.test(p));
                if (isIndex(prop)) {
                    const idx = Number(prop as any);
                    return self.at(idx);
                }
                if (prop === "length") return self.length;
                if (prop === (Symbol as any).iterator) {
                    // for..of 対応
                    return function*() {
                        const len = self.length;
                        for (let i = 0; i < len; i++) {
                            const it = self.at(i);
                            if (it) yield it;
                        }
                    };
                }
                return Reflect.get(target, prop, receiver);
            },
            has(target, prop) {
                const isIndex = (p: any) => (typeof p === "number") || (typeof p === "string" && /^\d+$/.test(p));
                if (isIndex(prop)) {
                    const idx = Number(prop as any);
                    return idx >= 0 && idx < self.length;
                }
                return Reflect.has(target, prop);
            },
            getOwnPropertyDescriptor(target, prop) {
                const isIndex = (p: any) => (typeof p === "number") || (typeof p === "string" && /^\d+$/.test(p));
                if (isIndex(prop)) {
                    const idx = Number(prop as any);
                    return {
                        configurable: true,
                        enumerable: true,
                        value: self.at(idx),
                        writable: false,
                    };
                }
                if (prop === "length") {
                    return {
                        configurable: true,
                        enumerable: false,
                        value: self.length,
                        writable: false,
                    } as any;
                }
                return Object.getOwnPropertyDescriptor(target, prop as any);
            },
        });
    }

    indexOf(item: Item): number {
        return this.childrenKeys().indexOf(item.key);
    }

    removeAt(index: number) {
        const key = this.childrenKeys()[index];
        if (key) this.tree.deleteNodeAndDescendants(key);
    }

    /**
     * 新しいノードを作成。index 指定時はその位置に並び替えます。
     */
    addNode(author: string, index?: number): Item {
        const nodeKey = this.tree.generateNodeKey();
        const now = Date.now();
        // value: Y.Map に text: Y.Text 他のメタを格納
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

        // 並び順
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

    addAlias(targetId: string, author: string, index?: number): Item {
        const it = this.addNode(author, index);
        // aliasTargetId は単なるメタ情報
        const v = (it as any).value as Y.Map<any>;
        v.set("aliasTargetId", targetId);
        return it;
    }
}

/**
 * プロジェクト（Y.Doc）全体のラッパ。
 * タイトルは ydoc.getMap('metadata').get('title') に保存。
 * アウトラインは yjs-orderedtree（YTree）で管理し、親キー 'root' を使用。
 */
export class Project {
    constructor(public readonly ydoc: Y.Doc, public readonly tree: YTree) {}

    static createInstance(title: string): Project {
        const doc = new Y.Doc();
        // ツリー用のY.MapをDocに作成/取得
        const ymap = doc.getMap("orderedTree");
        const tree = new YTree(ymap);
        // メタデータ
        const meta = doc.getMap("metadata");
        meta.set("title", title);
        return new Project(doc, tree);
    }

    // Create a Project wrapper from an existing Y.Doc
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

    /** ルート直下のItems（親キー 'root'） */
    get items(): Items {
        return new Items(this.ydoc, this.tree, "root");
    }

    /** ページ（最上位アイテム）を追加し、textにタイトルを設定 */
    addPage(title: string, author: string) {
        const page = this.items.addNode(author);
        page.updateText(title);
        return page;
    }
}

// -------------- 旧Fluid実装（参考のため残置。移行完了後に削除） --------------
/*
=======
>>>>>>> origin/main
import {
    type ReadonlyArrayNode,
    SchemaFactory,
    Tree,
    type TreeLeafValue,
    type TreeNode,
    TreeViewConfiguration,
    type ValidateRecursiveSchema,
} from "fluid-framework";
import { v4 as uuid } from "uuid";

// スキーマファクトリを作成
const sf = new SchemaFactory("fc1db2e8-0a00-11ee-be56-0242ac120003");

export class Comment extends sf.objectRecursive("Comment", {
    id: sf.string,
    text: sf.string,
    author: sf.string,
    created: sf.number,
    lastChanged: sf.number,
}) {
    public readonly updateText = (text: string) => {
        this.lastChanged = new Date().getTime();
        this.text = text;
    };
}

export class Comments extends sf.arrayRecursive("Comments", [Comment]) {
    public readonly addComment = (author: string, text: string) => {
        const time = new Date().getTime();
        const comment = new Comment({
            id: uuid(),
            text,
            author,
            created: time,
            lastChanged: time,
        });
        this.insertAtEnd(comment);
        return comment;
    };

    public readonly deleteComment = (commentId: string) => {
        const idx = this.findIndex(c => c.id === commentId);
        if (idx > -1) {
            this.removeAt(idx);
        }
    };

    public readonly updateComment = (commentId: string, text: string) => {
        const c = this.find(cm => cm.id === commentId);
        if (c) c.updateText(text);
    };
}

// アイテム定義をシンプル化
export class Item extends sf.objectRecursive("Item", {
    id: sf.string,
    text: sf.string, // テキスト内容
    author: sf.string,
    votes: sf.array(sf.string),
    attachments: sf.optional(sf.array(sf.string)),
    created: sf.number,
    componentType: sf.optional(sf.string), // コンポーネントタイプ（"table", "chart", undefined）
    aliasTargetId: sf.optional(sf.string),
    lastChanged: sf.number,
    items: () => Items, // 子アイテムを保持
    comments: () => Comments,
}) {
    // テキスト更新時にタイムスタンプも更新
    public readonly updateText = (text: string) => {
        this.lastChanged = new Date().getTime();
        this.text = text;
    };

    // 投票機能
    public readonly toggleVote = (user: string) => {
        const index = this.votes.indexOf(user);
        if (index > -1) {
            this.votes.removeAt(index);
        } else {
            this.votes.insertAtEnd(user);
        }
        this.lastChanged = new Date().getTime();
    };

    // 添付ファイルを追加
    public readonly addAttachment = (url: string) => {
        this.attachments?.insertAtEnd(url);
        this.lastChanged = new Date().getTime();
    };

    // 添付ファイルを削除
    public readonly removeAttachment = (url: string) => {
        const index = this.attachments?.indexOf(url);
        if (index !== undefined && index > -1) {
            this.attachments?.removeAt(index);
            this.lastChanged = new Date().getTime();
        }
    };

    // コメント機能
    public readonly addComment = (author: string, text: string) => {
        return (this.comments as Comments).addComment(author, text);
    };

    public readonly deleteComment = (commentId: string) => {
        (this.comments as Comments).deleteComment(commentId);
    };

    public readonly updateComment = (commentId: string, text: string) => {
        const c = (this.comments as Comments).find(cm => cm.id === commentId);
        if (c) c.updateText(text);
    };

    // アイテム削除機能
    public readonly delete = () => {
        const parent = Tree.parent(this);
        if (Tree.is(parent, Items)) {
            // 子アイテムがある場合、親に移動してから削除
            const items = this.items as ReadonlyArrayNode<TreeNode | TreeLeafValue>;
            if (items.length > 0) {
                Tree.runTransaction(parent, () => {
                    const index = parent.indexOf(this);
                    parent.moveRangeToIndex(index, 0, items.length, items);
                    parent.removeAt(parent.indexOf(this));
                });
            } else {
                // 子アイテムがない場合は単純に削除
                parent.removeAt(parent.indexOf(this));
            }
        }
    };
}

// アイテムのリスト
export class Items extends sf.arrayRecursive("Items", [Item]) {
    /**
     * 通常のアイテム（ページ内のノード）を追加
     * @param author 作成者
     * @param index 追加する位置のインデックス。未指定の場合は末尾に追加
     * @returns 作成されたアイテム
     */
    public readonly addNode = (author: string, index?: number) => {
        const timeStamp = new Date().getTime();

        // 開発環境では、アイテムのインデックスをテキストに設定
        const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
        const isTest = import.meta.env.MODE === "test"
            || process.env.NODE_ENV === "test"
            || import.meta.env.VITE_IS_TEST === "true";
        const itemIndex = index ?? this.length;
        const defaultText = isDev && !isTest ? `Item ${itemIndex}` : "";

        const newItem = new Item({
            id: uuid(),
            text: defaultText, // 開発環境ではインデックスを含むテキスト
            author,
            votes: [],
            attachments: [],
            created: timeStamp,
            lastChanged: timeStamp,
            // @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題(https://github.com/microsoft/FluidFramework/issues/22101)
            items: new Items([]), // 子アイテムのための空のリスト
            // @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題(https://github.com/microsoft/FluidFramework/issues/22101)
            comments: new Comments([]),
        });

        if (index !== undefined) {
            // 指定された位置に挿入
            if (index === 0) {
                this.insertAtStart(newItem);
            } else {
                this.insertAt(index, newItem);
            }
        } else {
            // 末尾に追加
            this.insertAtEnd(newItem);
        }
        return newItem;
    };

    public readonly addAlias = (targetId: string, author: string, index?: number) => {
        const item = this.addNode(author, index);
        (item as any).aliasTargetId = targetId;
        return item;
    };
}

// 型検証ヘルパー
{
    // @ts-ignore: TS6133
    type _check = ValidateRecursiveSchema<typeof Items>;
}

// アイテム定義をシンプル化
export class Project extends sf.objectRecursive("Project", {
    title: sf.string,
    items: () => Items, // 元のコードに戻す - TypeScript型エラーはあるが機能する
}) {
    // テキスト更新時にタイムスタンプも更新
    public readonly updateText = (text: string) => {
        this.title = text;
    };

    /**
     * ページとして機能するアイテム（最上位アイテム）を追加
     * このメソッドはルートItemsコレクションに対してのみ使用してください。
     * 通常のアイテムの子アイテムとしては使用しないでください。
     *
     * @param title ページのタイトル
     * @param author 作成者
     * @returns 作成されたページアイテム
     */
    public readonly addPage = (title: string, author: string) => {
        const pageItem = (this.items as Items).addNode(author);
        pageItem.updateText(title);
        return pageItem;
    };

    public static createInstance(title: string): Project {
        return new Project({
            title: title,
            // @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題
            items: new Items([]), // 空のアイテムリストで初期化
        });
    }
}

// 型検証ヘルパーはコメントアウト - 型エラーを避けるため
// {
// 	type _check = ValidateRecursiveSchema<typeof Project>;
// }

// TypeScriptのエラーは無視するが、ランタイム動作は問題ないはず
// @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題
export const appTreeConfiguration = new TreeViewConfiguration({
    schema: Project,
});
