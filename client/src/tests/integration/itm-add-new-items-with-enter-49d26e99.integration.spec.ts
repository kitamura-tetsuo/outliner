import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import OutlinerTree from "../../components/OutlinerTree.svelte";
import { Cursor } from "../../lib/Cursor";
import { getSelectionForUser } from "../../lib/cursor/CursorSelectionUtils";
import { Item, Project } from "../../schema/app-schema";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

// Type definition to avoid no-undef errors
type FrameRequestCallback = (time: number) => void;

class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver; }).ResizeObserver = ResizeObserver;
(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame; }).requestAnimationFrame = (
    cb: FrameRequestCallback,
) => setTimeout(cb, 0) as unknown as number;
(globalThis as unknown as { YTree: typeof YTree; }).YTree = YTree;

describe("ITM-0001: Add new item with Enter", () => {
    it("splits the item at the cursor position", () => {
        const project = Project.createInstance("test");
        const page = project.addPage("page", "me");
        const item = page.items.addNode("me");
        item.updateText("First part of text. Second part of text.");

        generalStore.project = project;
        generalStore.currentPage = page;

        render(OutlinerTree, { pageItem: page, projectName: "test", pageName: "page" });

        const cursor = new Cursor("c1", {
            itemId: item.id,
            offset: "First part of text.".length,
            isActive: true,
            userId: "me",
        });
        cursor.applyToStore();

        cursor.insertLineBreak();

        expect(page.items.length).toBe(2);
        const first = page.items.at(0)!;
        const second = page.items.at(1)!;
        expect(first.text).toBe("First part of text.");
        expect(second.text.trimStart()).toBe("Second part of text.");
        expect(cursor.itemId).toBe(second.id);
        expect(cursor.offset).toBe(0);
    });

    it.each([
        { label: "start", text: "HelloWorld", offset: 0, before: "", after: "HelloWorld" },
        { label: "middle", text: "HelloWorld", offset: 5, before: "Hello", after: "World" },
        { label: "end", text: "HelloWorld", offset: 10, before: "HelloWorld", after: "" },
        { label: "empty", text: "", offset: 0, before: "", after: "" },
    ])("atomically reparents the ordered subtree when splitting at the $label", ({ text, offset, before, after }) => {
        const project = Project.createInstance("test");
        const page = project.addPage("page", "me");
        const item = page.items.addNode("me");
        item.updateText(text);
        const child1 = item.items.addNode("me");
        child1.updateText("child 1");
        const grandchild = child1.items.addNode("me");
        grandchild.updateText("grandchild");
        const child2 = item.items.addNode("me");
        child2.updateText("child 2");
        const following = page.items.addNode("me");
        following.updateText("following");

        generalStore.project = project;
        generalStore.currentPage = page;
        render(OutlinerTree, { pageItem: page, projectName: "test", pageName: "page" });

        const cursor = new Cursor("c1", { itemId: item.id, offset, isActive: true, userId: "me" });
        cursor.applyToStore();
        const transactions: unknown[] = [];
        project.ydoc.on("afterTransaction", transaction => transactions.push(transaction));

        cursor.insertLineBreak();

        const sibling = page.items.at(1)!;
        expect([...page.items].map(node => node.id)).toEqual([item.id, sibling.id, following.id]);
        expect(item.text.toString()).toBe(before);
        expect(sibling.text.toString()).toBe(after);
        expect([...item.items]).toHaveLength(0);
        expect([...sibling.items].map(node => node.id)).toEqual([child1.id, child2.id]);
        expect([...child1.items].map(node => node.id)).toEqual([grandchild.id]);
        expect(project.tree.getNodeParentFromKey(child1.key)).toBe(sibling.key);
        expect(project.tree.getNodeParentFromKey(child2.key)).toBe(sibling.key);
        expect(project.tree.getNodeParentFromKey(grandchild.key)).toBe(child1.key);
        expect(cursor.itemId).toBe(sibling.id);
        expect(cursor.offset).toBe(0);
        expect(new Set(transactions).size).toBe(1);
    });

    it("refuses a Text sibling beneath a Layout without changing split-entry state", () => {
        const project = Project.createInstance("test");
        const page = project.addPage("page", "me");
        const layout = page.items.addNode("me");
        layout.componentType = "layout";
        const item = layout.items.addNode("me");
        item.updateText("HelloWorld");
        const child = item.items.addNode("me");
        child.updateText("child");
        generalStore.project = project;
        generalStore.currentPage = page;
        const cursor = new Cursor("c1", { itemId: item.id, offset: 5, isActive: true, userId: "me" });
        cursor.applyToStore();
        const updates: Uint8Array[] = [];
        project.ydoc.on("update", update => updates.push(update));

        cursor.insertLineBreak();

        expect(item.text.toString()).toBe("HelloWorld");
        expect([...layout.items].map(node => node.id)).toEqual([item.id]);
        expect([...item.items].map(node => node.id)).toEqual([child.id]);
        expect(cursor.itemId).toBe(item.id);
        expect(cursor.offset).toBe(5);
        expect(updates).toHaveLength(0);
    });

    it("clears a retained user selection after a successful ordinary split", () => {
        const project = Project.createInstance("test");
        const page = project.addPage("page", "me");
        const item = page.items.addNode("me");
        item.updateText("HelloWorld");
        generalStore.project = project;
        generalStore.currentPage = page;
        const cursor = new Cursor("c1", { itemId: item.id, offset: 7, isActive: true, userId: "me" });
        cursor.applyToStore();
        editorOverlayStore.setSelection({
            start: { itemId: item.id, offset: 2 },
            end: { itemId: item.id, offset: 7 },
            userId: "me",
        });

        cursor.insertLineBreak();

        expect(item.text.toString()).toBe("HelloWo");
        expect(page.items.at(1)!.text.toString()).toBe("rld");
        expect(getSelectionForUser("me")).toBeUndefined();
        expect(cursor.itemId).toBe(page.items.at(1)!.id);
        expect(cursor.offset).toBe(0);
    });

    it("publishes the complete split and subtree transfer in one replica update", () => {
        const project = Project.createInstance("test");
        const page = project.addPage("page", "me");
        const item = page.items.addNode("me");
        item.updateText("HelloWorld");
        const child1 = item.items.addNode("me");
        child1.updateText("metadata child");
        child1.tags = ["important", "preserve-me"];
        child1.duration = "PT45M";
        const grandchild = child1.items.addNode("me");
        grandchild.updateText("nested payload");
        const child2 = item.items.addNode("me");
        child2.componentType = "yjstable";
        child2.yjsGridId = "grid-binding-5795";
        const following = page.items.addNode("me");
        const replicaDoc = new Y.Doc();
        Y.applyUpdate(replicaDoc, Y.encodeStateAsUpdate(project.ydoc));
        const updates: Uint8Array[] = [];
        project.ydoc.on("update", update => updates.push(update));
        generalStore.project = project;
        generalStore.currentPage = page;
        const cursor = new Cursor("c1", { itemId: item.id, offset: 5, isActive: true, userId: "me" });

        cursor.insertLineBreak();

        expect(updates).toHaveLength(1);
        const sibling = page.items.at(1)!;
        Y.applyUpdate(replicaDoc, updates[0]!);
        const replica = Project.fromDoc(replicaDoc);
        const replicaPage = new Item(replicaDoc, replica.tree, page.key);
        const replicaSource = new Item(replicaDoc, replica.tree, item.key);
        const replicaSibling = replicaPage.items.at(1)!;
        expect([...replicaPage.items].map(node => node.id)).toEqual([item.id, replicaSibling.id, following.id]);
        expect(replicaSource.text.toString()).toBe("Hello");
        expect(replicaSibling.text.toString()).toBe("World");
        expect([...replicaSibling.items].map(node => node.id)).toEqual([child1.id, child2.id]);
        expect(replica.tree.getNodeParentFromKey(grandchild.key)).toBe(child1.key);
        const localChild = sibling.items.at(0)!;
        const localVisualChild = sibling.items.at(1)!;
        expect(localChild.id).toBe(child1.id);
        expect(localChild.text.toString()).toBe("metadata child");
        expect(localChild.tags).toEqual(["important", "preserve-me"]);
        expect(localChild.duration).toBe("PT45M");
        expect(localChild.items.at(0)!.id).toBe(grandchild.id);
        expect(localChild.items.at(0)!.text.toString()).toBe("nested payload");
        expect(localVisualChild.id).toBe(child2.id);
        expect(localVisualChild.componentType).toBe("yjstable");
        expect(localVisualChild.yjsGridId).toBe("grid-binding-5795");

        const replicaChild = replicaSibling.items.at(0)!;
        const replicaVisualChild = replicaSibling.items.at(1)!;
        expect(replicaChild.id).toBe(child1.id);
        expect(replicaChild.text.toString()).toBe("metadata child");
        expect(replicaChild.tags).toEqual(["important", "preserve-me"]);
        expect(replicaChild.duration).toBe("PT45M");
        expect(replicaChild.items.at(0)!.id).toBe(grandchild.id);
        expect(replicaChild.items.at(0)!.text.toString()).toBe("nested payload");
        expect(replicaVisualChild.id).toBe(child2.id);
        expect(replicaVisualChild.componentType).toBe("yjstable");
        expect(replicaVisualChild.yjsGridId).toBe("grid-binding-5795");
    });
});
