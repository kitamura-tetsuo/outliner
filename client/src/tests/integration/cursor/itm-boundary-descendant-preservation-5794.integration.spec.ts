import { canAcceptChild, GRID_COMPONENT_TYPE, LAYOUT_COMPONENT_TYPE } from "$shared/services/outlineNodeKind";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { applyBoundaryTreeEdit } from "../../../lib/cursor/boundaryTreeEdit";
import { type CursorEditingContext, CursorEditor } from "../../../lib/cursor/CursorEditor";
import { Item, Items, Project } from "../../../schema/app-schema";
import { store as generalStore } from "../../../stores/store.svelte";

function add(items: Items, text: string): Item {
    const item = items.addNode("test");
    item.updateText(text);
    return item;
}

function ids(items: Items): string[] {
    return Array.from(items, item => item.id);
}

function treeHas(project: Project, key: string): boolean {
    const tree = project.tree as unknown as {
        hasNode?: (nodeKey: string) => boolean;
        computedMap?: Map<string, unknown>;
    };
    return typeof tree.hasNode === "function" ? tree.hasNode(key) : tree.computedMap?.has(key) === true;
}

function editingContext(item: Item, offset: number): CursorEditingContext {
    return {
        itemId: item.id,
        offset,
        userId: "test",
        isActive: true,
        clearSelection: vi.fn(),
        applyToStore: vi.fn(),
        findTarget() {
            return this.itemId === item.id ? item : new Item(item.ydoc, item.tree, this.itemId);
        },
        moveToLineStart: vi.fn(),
        moveToLineEnd: vi.fn(),
    };
}

function usePage(project: Project, page: Item): void {
    generalStore.project = project;
    generalStore.currentPage = page;
}

function runAndReplicate(project: Project, action: () => void): Project {
    const replicaDoc = new Y.Doc();
    Y.applyUpdate(replicaDoc, Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc));
    const updates: Uint8Array[] = [];
    let transactions = 0;
    const onTransaction = (transaction: Y.Transaction) => {
        if (transaction.changed.size > 0) transactions += 1;
    };
    project.ydoc.on("update", update => updates.push(update));
    project.ydoc.on("afterTransaction", onTransaction);

    action();

    expect(transactions).toBe(1);
    expect(updates).toHaveLength(1);
    Y.applyUpdate(replicaDoc, updates[0]);
    return Project.fromDoc(replicaDoc as unknown as typeof project.ydoc);
}

afterEach(() => {
    generalStore.currentPage = undefined;
    generalStore.project = undefined;
    generalStore.activeViewModel = undefined;
});

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

    for (const direction of ["backward", "forward"] as const) {
        it(`refuses ${direction} merge with missing text storage without any mutation or caret movement`, () => {
            const project = Project.createInstance(`missing ${direction}`);
            const page = add(project.items, "Page");
            const a = add(page.items, "Alpha");
            const b = add(page.items, "Beta");
            const child = add(b.items, "Child");
            usePage(project, page);
            const context = editingContext(direction === "backward" ? b : a, direction === "backward" ? 0 : 5);
            const editor = new CursorEditor(context);
            (direction === "backward" ? a : b).yMap.delete("text");
            const before = Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc);
            const updates: Uint8Array[] = [];
            project.ydoc.on("update", update => updates.push(update));

            if (direction === "backward") editor.deleteBackward();
            else editor.deleteForward();

            expect(updates).toEqual([]);
            expect(Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc)).toEqual(before);
            expect(ids(page.items)).toEqual([a.id, b.id]);
            expect(ids(b.items)).toEqual([child.id]);
            expect(context.itemId).toBe(direction === "backward" ? b.id : a.id);
            expect(context.offset).toBe(direction === "backward" ? 0 : 5);
            editor.destroy();
        });
    }

    it("runs a forward Cursor merge as one complete update on a pre-action replica", () => {
        const project = Project.createInstance("cursor forward merge");
        const page = add(project.items, "Page");
        const a = add(page.items, "Alpha");
        const b = add(page.items, "Beta");
        const child = add(b.items, "Child");
        const grandchild = add(child.items, "Grandchild");
        child.yMap.set("collapsed", true);
        usePage(project, page);
        const context = editingContext(a, 5);
        const editor = new CursorEditor(context);
        const replicaDoc = new Y.Doc();
        Y.applyUpdate(replicaDoc, Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc));
        const updates: Uint8Array[] = [];
        project.ydoc.on("update", update => updates.push(update));

        editor.deleteForward();

        expect(updates).toHaveLength(1);
        expect(context.itemId).toBe(a.id);
        expect(context.offset).toBe(5);
        Y.applyUpdate(replicaDoc, updates[0]);
        const replica = Project.fromDoc(replicaDoc as unknown as typeof project.ydoc);
        const replicaPage = new Item(replica.ydoc, replica.tree, page.id);
        expect(ids(replicaPage.items)).toEqual([a.id]);
        const replicaA = new Item(replica.ydoc, replica.tree, a.id);
        expect(replicaA.text.toString()).toBe("AlphaBeta");
        expect(ids(replicaA.items)).toEqual([child.id]);
        const replicaChild = new Item(replica.ydoc, replica.tree, child.id);
        expect(replicaChild.yMap.get("collapsed")).toBe(true);
        expect(ids(replicaChild.items)).toEqual([grandchild.id]);
        expect(replicaChild.text.toString()).toBe("Child");
        editor.destroy();
    });

    it("runs a backward sibling merge as one complete replicated action", () => {
        const project = Project.createInstance("cursor backward merge");
        const page = add(project.items, "Page");
        const a = add(page.items, "Alpha");
        const b = add(page.items, "Beta");
        const child = add(b.items, "Child");
        child.yMap.set("metadata", "retained");
        usePage(project, page);
        const context = editingContext(b, 0);
        const editor = new CursorEditor(context);

        const replica = runAndReplicate(project, () => editor.deleteBackward());

        const replicaPage = new Item(replica.ydoc, replica.tree, page.id);
        const replicaA = new Item(replica.ydoc, replica.tree, a.id);
        expect(ids(replicaPage.items)).toEqual([a.id]);
        expect(treeHas(replica, b.id)).toBe(false);
        expect(replicaA.text.toString()).toBe("AlphaBeta");
        expect(ids(replicaA.items)).toEqual([child.id]);
        expect(new Item(replica.ydoc, replica.tree, child.id).yMap.get("metadata")).toBe("retained");
        expect([context.itemId, context.offset]).toEqual([a.id, 5]);
        editor.destroy();
    });

    it("appends source children after a collapsed sibling survivor's existing children", () => {
        const project = Project.createInstance("cursor backward append merge");
        const page = add(project.items, "Page");
        const a = add(page.items, "Alpha");
        const a1 = add(a.items, "A1");
        const a2 = add(a.items, "A2");
        const b = add(page.items, "Beta");
        const b1 = add(b.items, "B1");
        b1.yMap.set("metadata", "retained");
        const b1a = add(b1.items, "B1a");
        const b2 = add(b.items, "B2");
        usePage(project, page);
        generalStore.activeViewModel = { isCollapsed: itemId => itemId === a.id } as never;
        const context = editingContext(b, 0);
        const editor = new CursorEditor(context);

        const replica = runAndReplicate(project, () => editor.deleteBackward());

        const replicaPage = new Item(replica.ydoc, replica.tree, page.id);
        const replicaA = new Item(replica.ydoc, replica.tree, a.id);
        expect(ids(replicaPage.items)).toEqual([a.id]);
        expect(treeHas(replica, b.id)).toBe(false);
        expect(replicaA.text.toString()).toBe("AlphaBeta");
        expect(ids(replicaA.items)).toEqual([a1.id, a2.id, b1.id, b2.id]);
        const replicaB1 = new Item(replica.ydoc, replica.tree, b1.id);
        expect(replicaB1.yMap.get("metadata")).toBe("retained");
        expect(ids(replicaB1.items)).toEqual([b1a.id]);
        expect([context.itemId, context.offset]).toEqual([a.id, 5]);
        editor.destroy();
    });

    it("runs a direct-child forward merge as one complete replicated action", () => {
        const project = Project.createInstance("cursor direct child merge");
        const page = add(project.items, "Page");
        const parent = add(page.items, "Alpha");
        const source = add(parent.items, "Beta");
        const promoted = add(source.items, "Promoted");
        const after = add(parent.items, "After");
        usePage(project, page);
        const context = editingContext(parent, 5);
        const editor = new CursorEditor(context);

        const replica = runAndReplicate(project, () => editor.deleteForward());

        const replicaParent = new Item(replica.ydoc, replica.tree, parent.id);
        expect(replicaParent.text.toString()).toBe("AlphaBeta");
        expect(ids(replicaParent.items)).toEqual([promoted.id, after.id]);
        expect(treeHas(replica, source.id)).toBe(false);
        editor.destroy();
    });

    it("runs empty-wrapper promotion as one complete replicated action", () => {
        const project = Project.createInstance("cursor empty promotion");
        const page = add(project.items, "Page");
        const before = add(page.items, "Before");
        const empty = add(page.items, "");
        const promoted = add(empty.items, "Promoted");
        const after = add(page.items, "After");
        usePage(project, page);
        const context = editingContext(empty, 0);
        const editor = new CursorEditor(context);

        const replica = runAndReplicate(project, () => editor.deleteForward());

        const replicaPage = new Item(replica.ydoc, replica.tree, page.id);
        expect(ids(replicaPage.items)).toEqual([before.id, promoted.id, after.id]);
        expect(treeHas(replica, empty.id)).toBe(false);
        expect(new Item(replica.ydoc, replica.tree, promoted.id).text.toString()).toBe("Promoted");
        expect([context.itemId, context.offset]).toEqual([promoted.id, 0]);
        editor.destroy();
    });

    it("refuses empty-wrapper deletion when its only cursor fallback has no text storage", () => {
        const project = Project.createInstance("unsafe empty fallback");
        const page = add(project.items, "Page");
        const empty = add(page.items, "");
        page.yMap.delete("text");
        usePage(project, page);
        const context = editingContext(empty, 0);
        const editor = new CursorEditor(context);
        const before = Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc);
        const updates: Uint8Array[] = [];
        project.ydoc.on("update", update => updates.push(update));

        editor.deleteForward();

        expect(updates).toEqual([]);
        expect(Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc)).toEqual(before);
        expect(ids(page.items)).toEqual([empty.id]);
        expect([context.itemId, context.offset]).toEqual([empty.id, 0]);
        editor.destroy();
    });

    it("refuses empty-wrapper deletion when the current Text has missing storage", () => {
        const project = Project.createInstance("missing current wrapper text");
        const page = add(project.items, "Page");
        const beforeItem = add(page.items, "Before");
        const empty = add(page.items, "");
        const child = add(empty.items, "Child");
        const afterItem = add(page.items, "After");
        empty.yMap.delete("text");
        usePage(project, page);
        const context = editingContext(empty, 0);
        const editor = new CursorEditor(context);
        const before = Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc);
        const updates: Uint8Array[] = [];
        project.ydoc.on("update", update => updates.push(update));

        editor.deleteForward();

        expect(updates).toEqual([]);
        expect(Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc)).toEqual(before);
        expect(ids(page.items)).toEqual([beforeItem.id, empty.id, afterItem.id]);
        expect(ids(empty.items)).toEqual([child.id]);
        expect([context.itemId, context.offset]).toEqual([empty.id, 0]);
        expect(context.applyToStore).not.toHaveBeenCalled();
        expect(context.clearSelection).not.toHaveBeenCalled();
        editor.destroy();
    });

    it("runs visual promotion as one complete replicated action", () => {
        const project = Project.createInstance("cursor visual promotion");
        const page = add(project.items, "Page");
        const text = add(page.items, "Alpha");
        const layout = page.items.addNode("test");
        layout.componentType = LAYOUT_COMPONENT_TYPE;
        const visual = layout.items.addNode("test");
        visual.componentType = GRID_COMPONENT_TYPE;
        visual.yMap.set("binding", "retained");
        const after = add(page.items, "After");
        usePage(project, page);
        const context = editingContext(text, 5);
        const editor = new CursorEditor(context);

        const replica = runAndReplicate(project, () => editor.deleteForward());

        const replicaPage = new Item(replica.ydoc, replica.tree, page.id);
        expect(ids(replicaPage.items)).toEqual([text.id, visual.id, after.id]);
        expect(treeHas(replica, layout.id)).toBe(false);
        expect(new Item(replica.ydoc, replica.tree, visual.id).yMap.get("binding")).toBe("retained");
        expect([context.itemId, context.offset]).toEqual([text.id, 5]);
        editor.destroy();
    });

    it("refuses forward visual removal when the surviving Text storage is not Y.Text", () => {
        const project = Project.createInstance("unsafe forward visual target");
        const page = add(project.items, "Page");
        const text = add(page.items, "Alpha");
        const visual = page.items.addNode("test");
        visual.componentType = GRID_COMPONENT_TYPE;
        text.yMap.set("text", "Alpha");
        usePage(project, page);
        const context = editingContext(text, 5);
        const editor = new CursorEditor(context);
        const before = Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc);
        const updates: Uint8Array[] = [];
        project.ydoc.on("update", update => updates.push(update));

        editor.deleteForward();

        expect(updates).toEqual([]);
        expect(Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc)).toEqual(before);
        expect(ids(page.items)).toEqual([text.id, visual.id]);
        expect([context.itemId, context.offset]).toEqual([text.id, 5]);
        expect(context.applyToStore).not.toHaveBeenCalled();
        editor.destroy();
    });

    it("runs collapsed backward visual promotion as one complete replicated action", () => {
        const project = Project.createInstance("cursor backward visual promotion");
        const page = add(project.items, "Page");
        const before = add(page.items, "Before");
        const layout = page.items.addNode("test");
        layout.componentType = LAYOUT_COMPONENT_TYPE;
        const visual1 = layout.items.addNode("test");
        visual1.componentType = GRID_COMPONENT_TYPE;
        visual1.yMap.set("binding", "first");
        const visual2 = layout.items.addNode("test");
        visual2.componentType = GRID_COMPONENT_TYPE;
        visual2.yMap.set("binding", "second");
        const text = add(page.items, "After");
        usePage(project, page);
        generalStore.activeViewModel = { isCollapsed: itemId => itemId === layout.id } as never;
        const context = editingContext(text, 0);
        const editor = new CursorEditor(context);

        const replica = runAndReplicate(project, () => editor.deleteBackward());

        const replicaPage = new Item(replica.ydoc, replica.tree, page.id);
        expect(ids(replicaPage.items)).toEqual([before.id, visual1.id, visual2.id, text.id]);
        expect(treeHas(replica, layout.id)).toBe(false);
        expect(new Item(replica.ydoc, replica.tree, visual1.id).yMap.get("binding")).toBe("first");
        expect(new Item(replica.ydoc, replica.tree, visual2.id).yMap.get("binding")).toBe("second");
        expect(new Item(replica.ydoc, replica.tree, text.id).text.toString()).toBe("After");
        expect([context.itemId, context.offset]).toEqual([text.id, 0]);
        editor.destroy();
    });

    it("refuses backward visual removal when the surviving Text has missing storage", () => {
        const project = Project.createInstance("unsafe backward visual target");
        const page = add(project.items, "Page");
        const visual = page.items.addNode("test");
        visual.componentType = GRID_COMPONENT_TYPE;
        const text = add(page.items, "After");
        text.yMap.delete("text");
        usePage(project, page);
        const context = editingContext(text, 0);
        const editor = new CursorEditor(context);
        const before = Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc);
        const updates: Uint8Array[] = [];
        project.ydoc.on("update", update => updates.push(update));

        editor.deleteBackward();

        expect(updates).toEqual([]);
        expect(Y.encodeStateAsUpdate(project.ydoc as unknown as Y.Doc)).toEqual(before);
        expect(ids(page.items)).toEqual([visual.id, text.id]);
        expect([context.itemId, context.offset]).toEqual([text.id, 0]);
        expect(context.applyToStore).not.toHaveBeenCalled();
        editor.destroy();
    });
});
