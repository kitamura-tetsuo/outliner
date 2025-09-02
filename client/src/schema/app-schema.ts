// NOTE: 旧Fluid Frameworkベースのスキーマは下部にコメントアウトで残しています。
// このファイルはYjs + yjs-orderedtreeベースへ段階的に移行中です。

import { v4 as uuid } from "uuid";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";

export type Comment = {
    id: string;
    author: string;
    text: string;
    created: number;
    lastChanged: number;
};

/**
 * コメントデータ（Y.Map）を操作する軽量ラッパ
 */
export class Comments {
    constructor(private readonly yArray: Y.Array<Y.Map<any>>) {}

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
import {
    type ReadonlyArrayNode,
    SchemaFactory,
    Tree,
    type TreeLeafValue,
    type TreeNode,
    TreeViewConfiguration,
    type ValidateRecursiveSchema,
} from "fluid-framework";
const sf = new SchemaFactory("fc1db2e8-0a00-11ee-be56-0242ac120003");
// ... 旧実装は省略（Git履歴参照）
*/

// 互換目的: 旧Fluid依存コードからのimport解決用スタブ。移行完了後に削除予定。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const appTreeConfiguration: any = undefined;
