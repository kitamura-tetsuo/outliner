import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Item, Project } from "./yjs-schema";

describe("yjs-schema Item Votes", () => {
    let ydoc: Y.Doc;
    let ymap: Y.Map<unknown>;
    let tree: YTree;
    let project: Project;
    let item: Item;

    beforeEach(() => {
        ydoc = new Y.Doc();
        ymap = ydoc.getMap("orderedTree");
        tree = new YTree(ymap);
        project = new Project(ydoc, tree);
        item = project.items.addNode("test-user");
    });

    it("should initialize empty votes", () => {
        const votes = item.votes;
        expect(votes).toBeDefined();
        expect(votes.length).toBe(0);
    });

    it("should toggle vote and update lastChanged", () => {
        const initialLastChanged = item["value"].get("lastChanged");

        // Add vote
        item.toggleVote("user1");
        expect(item.votes.toArray()).toEqual(["user1"]);
        expect(item["value"].get("lastChanged")).toBeGreaterThanOrEqual(initialLastChanged as number);

        const midLastChanged = item["value"].get("lastChanged");

        // Remove vote
        item.toggleVote("user1");
        expect(item.votes.toArray()).toEqual([]);
        expect(item["value"].get("lastChanged")).toBeGreaterThanOrEqual(midLastChanged as number);
    });

    it("should allow multiple users to vote", () => {
        item.toggleVote("user1");
        item.toggleVote("user2");
        expect(item.votes.toArray()).toEqual(["user1", "user2"]);
    });

    it("should handle concurrent toggles from the same user self-healing on next toggle", () => {
        // Setup two disconnected documents that start in sync
        const doc2 = new Y.Doc();
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(ydoc));
        const tree2 = new YTree(doc2.getMap("orderedTree"));

        const item2 = new Item(doc2, tree2, item.key);

        // Concurrent votes from the same user while offline
        item.toggleVote("user1");
        item2.toggleVote("user1");

        // Merge documents
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(doc2));
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(ydoc));

        // Note: they might have duplicates in the underlying Y.Array at this point,
        // but OutlinerViewModel dedupes it for display.
        // Here we test the self-healing behavior of the CRDT when the user toggles again.

        // Remove vote in merged state
        item.toggleVote("user1");

        // Expect the item to be completely clear of "user1"
        expect(item.votes.toArray()).toEqual([]);
        expect(item.votes.length).toBe(0);
    });
});
