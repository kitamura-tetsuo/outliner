import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { YTree } from "yjs-orderedtree";
import OutlinerTree from "../../components/OutlinerTree.svelte";
import { Cursor } from "../../lib/Cursor";
import { Project } from "../../schema/app-schema";
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
});
