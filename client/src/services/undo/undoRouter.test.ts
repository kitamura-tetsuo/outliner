import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { UndoRouter } from "./undoRouter.svelte";

/** A scope: one doc, one map, one manager, registered with the router. */
function scope(router: UndoRouter, name: string, trackedOrigins?: Set<unknown>) {
    const doc = new Y.Doc();
    const map = doc.getMap<number>(name);
    const undo = new Y.UndoManager(map, trackedOrigins ? { trackedOrigins } : undefined);
    router.register(undo);
    const edit = (key: string, value: number, origin?: unknown) => {
        doc.transact(() => map.set(key, value), origin);
    };
    return { doc, map, undo, edit };
}

describe("UndoRouter", () => {
    it("undoes across scopes in strict reverse chronological order", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        const table = scope(router, "table");

        outline.edit("a", 1);
        table.edit("b", 2);
        outline.edit("c", 3);

        expect(router.undoDepth).toBe(3);
        expect(router.redoDepth).toBe(0);

        router.undo();
        expect(outline.map.has("c")).toBe(false);
        expect(table.map.has("b")).toBe(true);
        expect(outline.map.has("a")).toBe(true);

        router.undo();
        expect(table.map.has("b")).toBe(false);
        expect(outline.map.has("a")).toBe(true);

        router.undo();
        expect(outline.map.has("a")).toBe(false);
        expect(router.undoDepth).toBe(0);
        expect(router.redoDepth).toBe(3);
    });

    it("redoes across scopes in the order the operations happened", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        const table = scope(router, "table");

        outline.edit("a", 1);
        table.edit("b", 2);
        outline.edit("c", 3);

        router.undo();
        router.undo();
        router.undo();

        router.redo();
        expect(outline.map.get("a")).toBe(1);
        expect(table.map.has("b")).toBe(false);

        router.redo();
        expect(table.map.get("b")).toBe(2);
        expect(outline.map.has("c")).toBe(false);

        router.redo();
        expect(outline.map.get("c")).toBe(3);
        expect(router.redoDepth).toBe(0);
        expect(router.canRedo()).toBe(false);
    });

    it("keeps ordering when a scope is edited again within its capture window", () => {
        // Without closing the capture window of the other scopes, Yjs would merge
        // the two outline edits into one stack item and undo would revert both at
        // once, skipping past the table edit that happened between them.
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        const table = scope(router, "table");

        outline.edit("a", 1);
        table.edit("b", 2);
        outline.edit("c", 3);

        router.undo();
        expect(outline.map.has("c")).toBe(false);
        expect(outline.map.get("a")).toBe(1);

        router.undo();
        expect(table.map.has("b")).toBe(false);
        expect(outline.map.get("a")).toBe(1);
    });

    it("discards the redo history when a new operation happens", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        const table = scope(router, "table");

        outline.edit("a", 1);
        table.edit("b", 2);

        router.undo();
        expect(router.redoDepth).toBe(1);

        outline.edit("c", 3);
        expect(router.redoDepth).toBe(0);
        expect(router.canRedo()).toBe(false);

        router.redo();
        expect(table.map.has("b")).toBe(false);
    });

    it("drops entries of an unregistered scope without breaking later undos", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        const table = scope(router, "table");

        outline.edit("a", 1);
        table.edit("b", 2);
        expect(router.undoDepth).toBe(2);

        // Tearing the table down: its entries leave the global stack with it.
        router.unregister(table.undo);
        table.undo.destroy();
        expect(router.undoDepth).toBe(1);

        router.undo();
        expect(outline.map.has("a")).toBe(false);
        expect(table.map.get("b")).toBe(2);
        expect(router.undoDepth).toBe(0);
    });

    it("ignores further operations of an unregistered scope", () => {
        const router = new UndoRouter();
        const table = scope(router, "table");

        router.unregister(table.undo);
        table.edit("b", 2);

        expect(router.undoDepth).toBe(0);
        router.undo();
        expect(table.map.get("b")).toBe(2);
    });

    it("keeps remote-origin changes out of the local stack", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline", new Set([null]));

        outline.edit("local", 1);
        outline.edit("remote", 2, "remote-origin");

        expect(router.undoDepth).toBe(1);

        router.undo();
        expect(outline.map.has("local")).toBe(false);
        expect(outline.map.get("remote")).toBe(2);

        // Nothing left to undo: the remote change is not reachable.
        router.undo();
        expect(outline.map.get("remote")).toBe(2);
    });

    it("realigns itself when a scope is undone directly", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        const table = scope(router, "table");

        outline.edit("a", 1);
        table.edit("b", 2);

        // Not a supported path, but must not corrupt the router.
        table.undo.undo();
        expect(router.undoDepth).toBe(1);
        expect(router.redoDepth).toBe(1);

        router.undo();
        expect(outline.map.has("a")).toBe(false);
    });

    it("skips stale entries instead of consuming the undo", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        const table = scope(router, "table");

        outline.edit("a", 1);
        table.edit("b", 2);

        // The table drops its own history; its router entry is now stale.
        table.undo.clear();

        router.undo();
        expect(outline.map.has("a")).toBe(false);
        expect(table.map.get("b")).toBe(2);
    });

    it("reports availability as the stacks fill and drain", () => {
        // The toolbar buttons derive their `disabled` state from these two, so
        // every transition below is a transition the buttons must follow.
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        const table = scope(router, "table");

        expect(router.canUndo()).toBe(false);
        expect(router.canRedo()).toBe(false);

        outline.edit("a", 1);
        expect(router.canUndo()).toBe(true);
        expect(router.canRedo()).toBe(false);

        table.edit("b", 2);
        expect(router.canUndo()).toBe(true);

        router.undo();
        expect(router.canUndo()).toBe(true);
        expect(router.canRedo()).toBe(true);

        router.undo();
        expect(router.canUndo()).toBe(false);
        expect(router.canRedo()).toBe(true);

        router.redo();
        expect(router.canUndo()).toBe(true);
        expect(router.canRedo()).toBe(true);

        // A new operation discards the redo history.
        outline.edit("c", 3);
        expect(router.canRedo()).toBe(false);

        router.clear();
        expect(router.canUndo()).toBe(false);
        expect(router.canRedo()).toBe(false);
    });

    it("reports nothing to undo once the only scope is unregistered", () => {
        const router = new UndoRouter();
        const table = scope(router, "table");

        table.edit("b", 2);
        expect(router.canUndo()).toBe(true);

        router.unregister(table.undo);
        expect(router.canUndo()).toBe(false);
    });

    it("registers a manager only once", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        router.register(outline.undo);

        outline.edit("a", 1);
        expect(router.undoDepth).toBe(1);
    });

    describe("CompositeUndoEntry", () => {
        it("undoes and redoes a cross-project paste cleanly", () => {
            const router = new UndoRouter();
            const projectDoc = new Y.Doc();
            const treeMap = projectDoc.getMap<number>("orderedTree");
            const treeManager = new Y.UndoManager(treeMap);
            router.register(treeManager);

            // 1. Paste tables
            const registry = projectDoc.getMap<unknown>("yjsTables");
            const tableId = "t1";
            const subdoc = new Y.Doc({ guid: "test-guid" });
            subdoc.getText("schema").insert(0, "CREATE TABLE t1");
            const mapEntry = new Y.Map<unknown>();
            mapEntry.set("name", "Test Table");
            mapEntry.set("sqlName", "t1_sql");
            mapEntry.set("doc", subdoc);
            registry.set(tableId, mapEntry);

            // 2. Paste items
            projectDoc.transact(() => {
                treeMap.set("item1", 1);
            });
            expect(router.undoDepth).toBe(1);

            // Capture composite
            router.captureCrossProjectPaste(treeManager, projectDoc, [tableId]);
            expect(router.undoDepth).toBe(1);

            // Undo
            router.undo();
            expect(treeMap.has("item1")).toBe(false);
            expect(registry.has(tableId)).toBe(false); // removeTable removes the registry entry
            expect(router.redoDepth).toBe(1);

            // Redo
            router.redo();
            expect(treeMap.get("item1")).toBe(1);
            expect(registry.has(tableId)).toBe(true);
            const restoredEntry = registry.get(tableId) as Y.Map<unknown>;
            expect(restoredEntry.get("name")).toBe("Test Table");
            expect(restoredEntry.get("sqlName")).toBe("t1_sql");
            const restoredSubdoc = restoredEntry.get("doc") as Y.Doc;
            expect(restoredSubdoc.getText("schema").toString()).toBe("CREATE TABLE t1");
        });

        it("keeps chronological ordering when the pasted grid is edited before undo", () => {
            const router = new UndoRouter();
            const projectDoc = new Y.Doc();
            const treeMap = projectDoc.getMap<number>("orderedTree");
            const treeManager = new Y.UndoManager(treeMap);
            router.register(treeManager);

            const registry = projectDoc.getMap<unknown>("yjsTables");
            const tableId = "t1";
            const subdoc = new Y.Doc({ guid: "test-guid" });
            const mapEntry = new Y.Map<unknown>();
            mapEntry.set("doc", subdoc);
            registry.set(tableId, mapEntry);

            projectDoc.transact(() => {
                treeMap.set("item1", 1);
            });
            router.captureCrossProjectPaste(treeManager, projectDoc, [tableId]);

            // Now edit the table
            const tableMap = subdoc.getMap<number>("data");
            const tableManager = new Y.UndoManager(tableMap);
            router.register(tableManager);

            subdoc.transact(() => {
                tableMap.set("row1", 10);
            });

            expect(router.undoDepth).toBe(2);

            // Undo 1: Reverses the edit, table still exists
            router.undo();
            expect(tableMap.has("row1")).toBe(false);
            expect(registry.has(tableId)).toBe(true);
            expect(treeMap.has("item1")).toBe(true);

            // Undo 2: Reverses the paste, table removed
            router.undo();
            expect(registry.has(tableId)).toBe(false);
            expect(treeMap.has("item1")).toBe(false);
        });
    });
});
