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

    it("registers a manager only once", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");
        router.register(outline.undo);

        outline.edit("a", 1);
        expect(router.undoDepth).toBe(1);
    });

    it("reactively exposes its availability", () => {
        const router = new UndoRouter();
        const outline = scope(router, "outline");

        expect(router.canUndo()).toBe(false);
        expect(router.canRedo()).toBe(false);

        outline.edit("a", 1);
        expect(router.canUndo()).toBe(true);
        expect(router.canRedo()).toBe(false);

        router.undo();
        expect(router.canUndo()).toBe(false);
        expect(router.canRedo()).toBe(true);

        router.redo();
        expect(router.canUndo()).toBe(true);
        expect(router.canRedo()).toBe(false);
    });
});
