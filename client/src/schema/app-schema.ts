import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";

export class Comment {}
export class Comments {}

/** Yjs item wrapper */
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

    updateText(text: string) {
        const t = this.text;
        t.delete(0, t.length);
        if (text) t.insert(0, text);
        this.value.set("lastChanged", Date.now());
    }
}

/** Collection of child items under a parent key */
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
}

/** Project wrapper with Yjs subdocs for pages */
export class Project {
    constructor(public readonly ydoc: Y.Doc, public readonly tree: YTree) {}

    static createInstance(title: string): Project {
        const doc = new Y.Doc();
        const ymap = doc.getMap("orderedTree");
        const tree = new YTree(ymap);
        doc.getMap("metadata").set("title", title);
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

    /** Root-level items */
    get items(): Items {
        return new Items(this.ydoc, this.tree, "root");
    }

    /** Add a new page item and emit a Y.Subdoc for its content */
    addPage(title: string, author: string) {
        const page = this.items.addNode(author);
        page.updateText(title);
        const pages = this.ydoc.getMap<Y.Doc>("pages");
        const subdoc = new Y.Doc({ guid: page.id, parent: this.ydoc });
        pages.set(page.id, subdoc);
        subdoc.load();
        return page;
    }
}

export const appTreeConfiguration = {} as any;
