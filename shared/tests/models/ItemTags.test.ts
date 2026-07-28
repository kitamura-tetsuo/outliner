import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Item, PlainItemData } from "../../src/app-schema";

describe("Item tags", () => {
    it("returns an empty array when absent", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        expect(item.tags).toEqual([]);
    });

    it("adds and removes individual tags", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.addTag("work");
        item.addTag("urgent");
        expect(item.tags).toEqual(["work", "urgent"]);

        item.removeTag("work");
        expect(item.tags).toEqual(["urgent"]);
    });

    it("ignores blank tags and does not add duplicates", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.addTag("work");
        item.addTag("work");
        item.addTag("   ");
        expect(item.tags).toEqual(["work"]);
    });

    it("replaces the whole tag set via the setter, trimming and deduping", () => {
        const item = new Item({ id: "test" } as PlainItemData);
        item.addTag("stale");
        item.tags = [" work ", "urgent", "work", ""];
        expect(item.tags).toEqual(["work", "urgent"]);

        item.tags = [];
        expect(item.tags).toEqual([]);
    });

    it("setting tags does not modify the item's text", () => {
        const item = new Item({ id: "test", text: "Hello" } as PlainItemData);
        item.addTag("work");
        expect(item.text).toBe("Hello");
    });

    it("merges concurrent tag additions from two clients", () => {
        const originalItem = new Item({ id: "test-item" } as PlainItemData);

        const doc1 = new Y.Doc();
        const doc2 = new Y.Doc();
        const update = Y.encodeStateAsUpdate(originalItem.ydoc);
        Y.applyUpdate(doc1, update);
        Y.applyUpdate(doc2, update);

        const tree1 = new YTree(doc1.getMap("orderedTree"));
        const i1 = new Item(doc1, tree1, originalItem.key);

        const tree2 = new YTree(doc2.getMap("orderedTree"));
        const i2 = new Item(doc2, tree2, originalItem.key);

        // Concurrent, unsynchronized edits from two clients.
        i1.addTag("work");
        i2.addTag("urgent");

        const u1 = Y.encodeStateAsUpdate(doc1);
        const u2 = Y.encodeStateAsUpdate(doc2);
        Y.applyUpdate(doc2, u1);
        Y.applyUpdate(doc1, u2);

        expect(new Set(i1.tags)).toEqual(new Set(["work", "urgent"]));
        expect(new Set(i2.tags)).toEqual(new Set(["work", "urgent"]));
    });
});
