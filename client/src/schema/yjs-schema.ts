// Minimal Yjs-based schema wrappers for yjsService and tests

import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";

interface ItemData {
    id: string;
    author: string;
    created: number;
    lastChanged: number;
    componentType?: string;
    aliasTargetId?: string;
    text: Y.Text;
    votes: Y.Array<string>;
    attachments: Y.Array<string>;
    comments: Y.Array<Y.Map<unknown>>;
}

export class Item {
    constructor(
        public readonly ydoc: Y.Doc,
        public readonly tree: YTree,
        public readonly key: string,
    ) {}

    private get value(): Y.Map<ItemData> {
        return this.tree.getNodeValueFromKey(this.key) as Y.Map<ItemData>;
    }

    get id(): string {
        return this.value.get("id") as unknown as string;
    }

    get text(): Y.Text {
        return this.value.get("text") as unknown as Y.Text;
    }

    updateText(text: string) {
        const t = this.text;
        t.delete(0, t.length);
        if (text) t.insert(0, text);
        this.value.set("lastChanged", Date.now() as unknown as ItemData);
    }

    // 添付ファイル: Y.Array<string> を保証して返す
    get attachments(): Y.Array<string> {
        let arr = this.value.get("attachments") as unknown as Y.Array<string> | undefined;
        if (!arr) {
            arr = new Y.Array<string>();
            this.value.set("attachments", arr as unknown as ItemData);
        }
        return arr;
    }

    // 添付を追加（重複は無視）。テスト同期用に CustomEvent も発火
    addAttachment(url: string) {
        const arr = this.attachments;
        if (!arr.toArray().includes(url)) {
            arr.push([url]);
            this.value.set("lastChanged", Date.now() as unknown as ItemData);
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
            this.value.set("lastChanged", Date.now() as unknown as ItemData);
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
        const parentKey = this.tree.getNodeParentFromKey(this.key);
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

        const value = new Y.Map<unknown>();
        value.set("id", nodeKey as unknown as ItemData);
        value.set("author", author as unknown as ItemData);
        value.set("created", now as unknown as ItemData);
        value.set("lastChanged", now as unknown as ItemData);
        value.set("componentType", undefined as unknown as ItemData);
        value.set("aliasTargetId", undefined as unknown as ItemData);
        value.set("text", new Y.Text() as unknown as ItemData);
        value.set("votes", new Y.Array<string>() as unknown as ItemData);
        value.set("attachments", new Y.Array<string>() as unknown as ItemData);
        value.set("comments", new Y.Array<Y.Map<unknown>>() as unknown as ItemData);

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
            const meta = this.ydoc.getMap("metadata") as Y.Map<unknown>;
            return String(meta.get("title") ?? "");
        } catch {
            return "";
        }
    }

    get items(): Items {
        return new Items(this.ydoc, this.tree, "root");
    }

    // Fluid互換API: ページ（最上位アイテム）を追加
    addPage(title: string, author: string): Item {
        const page = this.items.addNode(author ?? "user");
        page.updateText(title ?? "");
        const pages = this.ydoc.getMap<Y.Doc>("pages");
        const subdoc = new Y.Doc({ guid: page.id });
        pages.set(page.id, subdoc);
        subdoc.load();
        return page;
    }
}
