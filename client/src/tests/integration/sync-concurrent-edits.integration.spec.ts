import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Item, Project } from "../../schema/yjs-schema";

describe("Concurrent Editing", () => {
    let doc1: Y.Doc;
    let doc2: Y.Doc;

    beforeEach(() => {
        doc1 = new Y.Doc();
        doc2 = new Y.Doc();
        doc1.on("update", (update) => {
            Y.applyUpdate(doc2, update);
        });
        doc2.on("update", (update) => {
            Y.applyUpdate(doc1, update);
        });
    });

    it("should merge concurrent edits without losing characters when using insertTextAt", () => {
        const tree1 = Project.fromDoc(doc1);
        const page = tree1.addPage("page", "test_user");
        const item = page.items.addNode("test_user");
        item.insertTextAt(0, "hello");

        // Sync docs
        const tree2 = Project.fromDoc(doc2);
        const item2 = new Item(doc2, tree2.tree, item.key);
        expect(item2?.text.toString()).toBe("hello");

        // Disconnect to simulate concurrency
        doc1.on("update", () => {}); // Just make new docs and apply manually

        const update1 = Y.encodeStateAsUpdate(doc1);
        const d1 = new Y.Doc();
        const d2 = new Y.Doc();
        Y.applyUpdate(d1, update1);
        Y.applyUpdate(d2, update1);

        const t1 = Project.fromDoc(d1);
        const i1 = new Item(d1, t1.tree, item.key);
        const t2 = Project.fromDoc(d2);
        const i2 = new Item(d2, t2.tree, item.key);

        // User A edits at start
        i1?.insertTextAt(0, "A");

        // User B edits at end
        i2?.insertTextAt(5, "B");

        // Exchange updates
        Y.applyUpdate(d1, Y.encodeStateAsUpdate(d2));
        Y.applyUpdate(d2, Y.encodeStateAsUpdate(d1));

        expect(i1?.text.toString()).toBe("AhelloB");
        expect(i2?.text.toString()).toBe("AhelloB");
    });

    it("should merge concurrent edits without losing characters when using updateText (diff)", () => {
        const doc = new Y.Doc();
        const tree = Project.fromDoc(doc);
        const page = tree.addPage("page", "test_user");
        const item = page.items.addNode("test_user");
        item.updateText("hello");

        const update = Y.encodeStateAsUpdate(doc);
        const d1 = new Y.Doc();
        const d2 = new Y.Doc();
        Y.applyUpdate(d1, update);
        Y.applyUpdate(d2, update);

        const t1 = Project.fromDoc(d1);
        const i1 = new Item(d1, t1.tree, item.key);
        const t2 = Project.fromDoc(d2);
        const i2 = new Item(d2, t2.tree, item.key);

        // User A edits at start via updateText
        i1?.updateText("Ahello");

        // User B edits at end via updateText
        i2?.updateText("helloB");

        // Exchange updates
        Y.applyUpdate(d1, Y.encodeStateAsUpdate(d2));
        Y.applyUpdate(d2, Y.encodeStateAsUpdate(d1));

        expect(i1?.text.toString()).toBe("AhelloB");
        expect(i2?.text.toString()).toBe("AhelloB");
    });
});
