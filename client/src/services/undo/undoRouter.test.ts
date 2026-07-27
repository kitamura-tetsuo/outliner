import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { UndoRouter } from "./undoRouter";

describe("UndoRouter", () => {
    it("orders operations across multiple scopes", () => {
        const router = new UndoRouter();

        const doc1 = new Y.Doc();
        const map1 = doc1.getMap("test1");
        const um1 = new Y.UndoManager(map1);
        router.register(um1);

        const doc2 = new Y.Doc();
        const map2 = doc2.getMap("test2");
        const um2 = new Y.UndoManager(map2);
        router.register(um2);

        doc1.transact(() => {
            map1.set("a", 1);
        });
        doc2.transact(() => {
            map2.set("b", 2);
        });

        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(2);
        expect((router as unknown as { redoStack: unknown[]; }).redoStack.length).toBe(0);

        router.undo();
        expect(map2.has("b")).toBe(false);
        expect(map1.has("a")).toBe(true);
        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(1);
        expect((router as unknown as { redoStack: unknown[]; }).redoStack.length).toBe(1);

        router.undo();
        expect(map1.has("a")).toBe(false);
        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(0);
        expect((router as unknown as { redoStack: unknown[]; }).redoStack.length).toBe(2);

        router.redo();
        expect(map1.has("a")).toBe(true);
        expect(map2.has("b")).toBe(false);
        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(1);
        expect((router as unknown as { redoStack: unknown[]; }).redoStack.length).toBe(1);

        router.redo();
        expect(map2.has("b")).toBe(true);
        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(2);
        expect((router as unknown as { redoStack: unknown[]; }).redoStack.length).toBe(0);
    });

    it("clears redo stack when new operation happens", () => {
        const router = new UndoRouter();
        const doc = new Y.Doc();
        const map = doc.getMap("test");
        const um = new Y.UndoManager(map);
        router.register(um);

        doc.transact(() => {
            map.set("a", 1);
        });
        router.undo();

        expect((router as unknown as { redoStack: unknown[]; }).redoStack.length).toBe(1);

        doc.transact(() => {
            map.set("b", 2);
        });
        expect((router as unknown as { redoStack: unknown[]; }).redoStack.length).toBe(0);
        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(1); // The first operation's redo was discarded. Wait...
        // In Yjs, when you undo then make a new change, the new change is added.
        // The original undone change is gone. Let's see what um.undoStack.length is.
        expect(um.undoStack.length).toBe(1);
    });

    it("handles unregistered destroyed scopes properly", () => {
        const router = new UndoRouter();
        const doc1 = new Y.Doc();
        const map1 = doc1.getMap("test1");
        const um1 = new Y.UndoManager(map1);
        router.register(um1);

        const doc2 = new Y.Doc();
        const map2 = doc2.getMap("test2");
        const um2 = new Y.UndoManager(map2);
        router.register(um2);

        doc1.transact(() => {
            map1.set("a", 1);
        });
        doc2.transact(() => {
            map2.set("b", 2);
        });

        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(2);

        router.unregister(um2);
        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(1);

        router.undo();
        // Since um2 was destroyed, the undo targets um1
        expect(map1.has("a")).toBe(false);
    });

    it("remote origin changes stay outside the local stack", () => {
        const router = new UndoRouter();
        const doc1 = new Y.Doc();
        const map1 = doc1.getMap("test1");
        const um1 = new Y.UndoManager(map1, { trackedOrigins: new Set([null]) });
        router.register(um1);

        // local change
        doc1.transact(() => {
            map1.set("a", 1);
        });

        // remote change
        doc1.transact(() => {
            map1.set("b", 2);
        }, "remote");

        expect((router as unknown as { undoStack: unknown[]; }).undoStack.length).toBe(1);

        router.undo();
        expect(map1.has("a")).toBe(false);
        expect(map1.has("b")).toBe(true); // remote change is untouched
    });
});
