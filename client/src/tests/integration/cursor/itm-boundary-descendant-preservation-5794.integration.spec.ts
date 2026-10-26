import { canAcceptChild, GRID_COMPONENT_TYPE, LAYOUT_COMPONENT_TYPE } from "$shared/services/outlineNodeKind";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyBoundaryTreeEdit } from "../../../lib/cursor/boundaryTreeEdit";
import { Item, Items, Project } from "../../../schema/app-schema";

function add(items: Items, text: string): Item {
    const item = items.addNode("test");
    item.updateText(text);
    return item;
}

function ids(items: Items): string[] {
    return Array.from(items, item => item.id);
}

describe("item-boundary descendant preservation", () => {
    it("merges text and reparents an ordered nested subtree in one update", () => {
        const project = Project.createInstance("boundary merge");
        const a = add(project.items, "Alpha");
        const b = add(project.items, "Beta");
        const b1 = add(b.items, "B1");
        const b2 = add(b.items, "B2");
        const b1a = add(b1.items, "B1a");

        const replicaDoc = new Y.Doc();
        Y.applyUpdate(replicaDoc, Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc));
        const updates: Uint8Array[] = [];
        project.ydoc.on("update", update => updates.push(update));

        expect(applyBoundaryTreeEdit({ kind: "merge", source: b, survivor: a, mergedText: "AlphaBeta" })).toBe(true);
        expect(updates).toHaveLength(1);

        const result = Project.fromDoc(project.ydoc);
        expect(ids(result.items)).toEqual([a.id]);
        expect(new Item(result.ydoc, result.tree, a.id).text.toString()).toBe("AlphaBeta");
        expect(ids(new Item(result.ydoc, result.tree, a.id).items)).toEqual([b1.id, b2.id]);
        expect(ids(new Item(result.ydoc, result.tree, b1.id).items)).toEqual([b1a.id]);

        Y.applyUpdate(replicaDoc, updates[0]);
        const replica = Project.fromDoc(replicaDoc as unknown as typeof project.ydoc);
        expect(ids(new Item(replica.ydoc, replica.tree, a.id).items)).toEqual([b1.id, b2.id]);
        expect(new Item(replica.ydoc, replica.tree, a.id).text.toString()).toBe("AlphaBeta");
    });

    it("replaces a direct-child source slot rather than appending its children", () => {
        const project = Project.createInstance("direct child merge");
        const parent = add(project.items, "A");
        const before = add(parent.items, "before");
        const source = add(parent.items, "B");
        const child1 = add(source.items, "B1");
        const child2 = add(source.items, "B2");
        const after = add(parent.items, "after");

        expect(applyBoundaryTreeEdit({ kind: "merge", source, survivor: parent, mergedText: "AB" })).toBe(true);
        expect(ids(parent.items)).toEqual([before.id, child1.id, child2.id, after.id]);
    });

    it("promotes children at an empty wrapper's original sibling slot", () => {
        const project = Project.createInstance("wrapper promotion");
        const parent = add(project.items, "P");
        const before = add(parent.items, "before");
        const wrapper = add(parent.items, "");
        const child1 = add(wrapper.items, "C1");
        const child2 = add(wrapper.items, "C2");
        const grandchild = add(child1.items, "G");
        const after = add(parent.items, "after");

        expect(applyBoundaryTreeEdit({ kind: "promote", source: wrapper })).toBe(true);
        expect(ids(parent.items)).toEqual([before.id, child1.id, child2.id, after.id]);
        expect(ids(child1.items)).toEqual([grandchild.id]);
    });

    it("removes only a visual container and promotes its original visual placements", () => {
        const project = Project.createInstance("visual promotion");
        const parent = add(project.items, "P");
        const before = add(parent.items, "before");
        const layout = parent.items.addNode("test");
        layout.componentType = LAYOUT_COMPONENT_TYPE;
        const visual1 = layout.items.addNode("test");
        visual1.componentType = GRID_COMPONENT_TYPE;
        const visual2 = layout.items.addNode("test");
        visual2.componentType = GRID_COMPONENT_TYPE;
        const after = add(parent.items, "after");

        expect(applyBoundaryTreeEdit({ kind: "promote", source: layout })).toBe(true);
        expect(ids(parent.items)).toEqual([before.id, visual1.id, visual2.id, after.id]);
        expect(visual1.componentType).toBe(GRID_COMPONENT_TYPE);
        expect(visual2.componentType).toBe(GRID_COMPONENT_TYPE);
    });

    it("refuses an incompatible transfer without text or tree changes", () => {
        const project = Project.createInstance("invalid transfer");
        const layout = project.items.addNode("test");
        layout.componentType = LAYOUT_COMPONENT_TYPE;
        const source = add(project.items, "source");
        const textChild = add(source.items, "child");
        expect(canAcceptChild(layout, textChild)).toBe(false);

        const before = Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc);
        expect(applyBoundaryTreeEdit({ kind: "merge", source, survivor: layout, mergedText: "bad" })).toBe(false);
        expect(Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc)).toEqual(before);
        expect(ids(source.items)).toEqual([textChild.id]);
        expect(ids(project.items)).toEqual([layout.id, source.id]);
    });
});
