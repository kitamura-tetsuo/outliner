import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { YTree } from "yjs-orderedtree";
import OutlinerTree from "../../components/OutlinerTree.svelte";
import { Cursor } from "../../lib/Cursor";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";

class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserver;
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
(globalThis as any).Tree = YTree;

describe("ITM-0001: Enterで新規アイテム追加", () => {
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
});
