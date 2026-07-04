import { describe, it, expect, beforeEach } from "vitest";
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

        // Wait a bit to ensure lastChanged will be different
        const start = Date.now();
        while (Date.now() - start < 2) {}

        // Add vote
        item.toggleVote("user1");
        expect(item.votes.toArray()).toEqual(["user1"]);
        expect(item["value"].get("lastChanged")).toBeGreaterThan(initialLastChanged as number);

        const midLastChanged = item["value"].get("lastChanged");

        // Wait a bit to ensure lastChanged will be different
        const start2 = Date.now();
        while (Date.now() - start2 < 2) {}

        // Remove vote
        item.toggleVote("user1");
        expect(item.votes.toArray()).toEqual([]);
        expect(item["value"].get("lastChanged")).toBeGreaterThan(midLastChanged as number);
    });

    it("should allow multiple users to vote", () => {
        item.toggleVote("user1");
        item.toggleVote("user2");
        expect(item.votes.toArray()).toEqual(["user1", "user2"]);
    });
});
