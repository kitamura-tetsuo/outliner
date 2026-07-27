import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Item, PlainItemData } from "../../src/app-schema";

describe("Item Schedule Properties Sync", () => {
    it("synchronizes due and done fields across clients and merges concurrently", () => {
        // Create initial item in its own ydoc
        const originalItem = new Item({ id: "test-item" } as PlainItemData);

        // Setup two independent documents and apply the initial state
        const doc1 = new Y.Doc();
        const doc2 = new Y.Doc();
        const update = Y.encodeStateAsUpdate(originalItem.ydoc);
        Y.applyUpdate(doc1, update);
        Y.applyUpdate(doc2, update);

        // Wrap them
        const tree1 = new YTree(doc1.getMap("orderedTree"));
        const i1 = new Item(doc1, tree1, originalItem.key);

        const tree2 = new YTree(doc2.getMap("orderedTree"));
        const i2 = new Item(doc2, tree2, originalItem.key);

        // Edit them concurrently (no sync yet)
        i1.due = "2023-12-01T12:00:00Z";
        i2.done = true;

        // Exchange updates
        const u1 = Y.encodeStateAsUpdate(doc1);
        const u2 = Y.encodeStateAsUpdate(doc2);

        Y.applyUpdate(doc2, u1);
        Y.applyUpdate(doc1, u2);

        // Both should have merged fields
        expect(i1.due).toBe("2023-12-01T12:00:00Z");
        expect(i1.done).toBe(true);

        expect(i2.due).toBe("2023-12-01T12:00:00Z");
        expect(i2.done).toBe(true);
    });
});
