import { Project } from "$shared/app-schema";
import { expect, it } from "vitest";
import * as Y from "yjs";
import { TransferBindings } from "../clipboard/transferBindings";
import { createGrid, getGridRegistry } from "../yjstable/gridDocs";
import { UndoRouter } from "./undoRouter.svelte";

function fixture() {
    const project = Project.createInstance("Placement witnesses");
    const page = project.addPage("Page", "fixture");
    const grid = createGrid(project.ydoc, { name: "Owned", query: "SELECT 1 AS id" });
    const bindings = new TransferBindings(project.ydoc);
    bindings.capture("grid", grid, true);
    const manager = new Y.UndoManager(project.ydoc.getMap("orderedTree"));
    const router = new UndoRouter();
    router.register(manager);
    const finish = bindings.beginPlacementCapture(project);
    let original!: ReturnType<typeof page.items.addNode>;
    project.ydoc.transact(() => {
        original = page.items.addNode("local");
        const value = project.tree.getNodeValueFromKey(original.key) as Y.Map<unknown>;
        value.set("componentType", "yjstable");
        value.set("yjsGridId", grid);
    });
    finish();
    router.captureCrossProjectPaste(manager, project.ydoc, bindings);
    const positions = () => [router.undoDepth, router.redoDepth, manager.undoStack.length, manager.redoStack.length];
    return { project, page, grid, original, manager, router, positions };
}

for (const layout of [false, true]) {
    it(`refuses a peer ${layout ? "Layout" : "Page"} placement, then retries and refreshes replay witnesses`, () => {
        const f = fixture();
        let parent = f.page;
        let extra!: ReturnType<typeof parent.items.addNode>;
        f.project.ydoc.transact(() => {
            if (layout) {
                parent = f.page.items.addNode("peer");
                parent.componentType = "layout";
            }
            extra = parent.items.addNode("peer");
            const value = f.project.tree.getNodeValueFromKey(extra.key) as Y.Map<unknown>;
            value.set("componentType", "yjstable");
            value.set("yjsGridId", f.grid);
        }, "peer");
        const before = f.project.ydoc.getMap("orderedTree").toJSON();
        const positions = f.positions();
        const entry = getGridRegistry(f.project.ydoc).get(f.grid);
        f.router.undo();
        expect(f.positions()).toEqual(positions);
        expect(f.project.ydoc.getMap("orderedTree").toJSON()).toEqual(before);
        expect(getGridRegistry(f.project.ydoc).get(f.grid)).toBe(entry);
        // Remove only the extra placement; its containing Layout is unrelated peer state.
        f.project.ydoc.transact(() => {
            const value = f.project.tree.getNodeValueFromKey(extra.key) as Y.Map<unknown>;
            value.set("componentType", undefined);
            value.set("yjsGridId", undefined);
        }, "peer");
        f.router.undo();
        expect(getGridRegistry(f.project.ydoc).has(f.grid)).toBe(false);
        f.router.redo();
        expect(getGridRegistry(f.project.ydoc).get(f.grid)).not.toBe(entry);
        f.router.undo();
        expect(getGridRegistry(f.project.ydoc).has(f.grid)).toBe(false);
        if (layout) expect(parent.componentType).toBe("layout");
    });
}

it("refuses an owned placement rebound to another Grid before deleting either definition", () => {
    const f = fixture();
    const other = createGrid(f.project.ydoc, { name: "Peer", query: "SELECT 2 AS id" });
    f.project.ydoc.transact(() => {
        (f.project.tree.getNodeValueFromKey(f.original.key) as Y.Map<unknown>).set("yjsGridId", other);
    }, "peer");
    const positions = f.positions();
    f.router.undo();
    expect(f.positions()).toEqual(positions);
    expect([...getGridRegistry(f.project.ydoc).keys()]).toEqual([f.grid, other]);
});

it("does not adopt placements published before the insertion boundary", () => {
    const f = fixture();
    const bindings = new TransferBindings(f.project.ydoc);
    bindings.capture("grid", f.grid, true);
    const finish = bindings.beginPlacementCapture(f.project);
    finish();
    expect(() => bindings.assertOwned()).toThrow("placements");
});
