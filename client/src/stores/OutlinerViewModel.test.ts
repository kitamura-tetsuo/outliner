import { beforeEach, describe, expect, it } from "vitest";
import { Comments, Item, Items } from "../schema/app-schema";
import { OutlinerViewModel } from "./OutlinerViewModel";

function createSimpleTree() {
    const root = new Item({
        id: "root",
        text: "root",
        author: "u",
        votes: [],
        created: 0,
        lastChanged: 0,
        // @ts-expect-error - Known upstream typing quirk
        items: new Items([]),
        // @ts-expect-error - Known upstream typing quirk
        comments: new Comments([]),
    });
    const child1 = root.items.addNode("u");
    child1.id = "child1";
    child1.text = "child1";
    const child2 = root.items.addNode("u");
    child2.id = "child2";
    child2.text = "child2";
    return root;
}

describe("OutlinerViewModel", () => {
    let vm: OutlinerViewModel;
    let tree: Item;

    beforeEach(() => {
        vm = new OutlinerViewModel();
        tree = createSimpleTree();
    });

    it("updateFromModel builds visible order with depth", () => {
        vm.updateFromModel(tree);
        const ids = vm.getVisibleItems().map(i => i.model.id);
        expect(ids).toEqual(["root", "child1", "child2"]);
        expect(vm.getViewModel("child1")?.text).toBe("child1");
        expect(vm.getVisibleItems().find(i => i.model.id === "child2")?.depth).toBe(1);
    });

    it("toggleCollapsed hides children from visible items", () => {
        vm.updateFromModel(tree);
        vm.toggleCollapsed("child1");
        expect(vm.isCollapsed("child1")).toBe(true);
        // when collapsed, child1's children would be hidden; simulate by adding grandchild
        const grand = ((tree.items as any)[0] as Item).items.addNode("u");
        grand.id = "grand";
        grand.text = "grand";
        vm.updateFromModel(tree);
        expect(vm.getVisibleItems().map(i => i.model.id)).not.toContain("grand");
    });

    it("tracks comment counts", () => {
        const c = ((tree.items as any)[0] as Item).addComment("u", "hi");
        vm.updateFromModel(tree);
        expect(vm.getViewModel("child1")?.commentCount).toBe(1);
        ((tree.items as any)[0] as Item).updateComment(c.id, "edited");
        vm.updateFromModel(tree);
        expect(vm.getViewModel("child1")?.commentCount).toBe(1);
        ((tree.items as any)[0] as Item).deleteComment(c.id);
        vm.updateFromModel(tree);
        expect(vm.getViewModel("child1")?.commentCount).toBe(0);
    });
});
