import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { UndoRouter } from "./undoRouter.svelte";

function scope(router: UndoRouter) {
    const doc = new Y.Doc();
    const map = doc.getMap<number>("values");
    const undo = new Y.UndoManager(map);
    router.register(undo);
    return { doc, map, undo };
}

describe("synchronous history owner cleanup", () => {
    for (const cleanup of ["unregister", "clear scope"] as const) {
        it(`retains enclosing manual replay and unrelated history during ${cleanup}`, () => {
            const router = new UndoRouter();
            const other = scope(router);
            const removed = scope(router);
            other.map.set("keep", 1);
            removed.map.set("gone", 2);
            let present = true;
            router.captureManual(() => {}, {
                type: "manual",
                undo: () => {
                    present = false;
                    if (cleanup === "unregister") router.unregister(removed.undo);
                    else removed.undo.clear();
                },
                redo: () => {
                    present = true;
                },
            });
            router.undo();
            expect(present).toBe(false);
            expect(router.undoDepth).toBe(1);
            expect(router.redoDepth).toBe(1);
            router.redo();
            expect(present).toBe(true);
            router.undo();
            expect(present).toBe(false);
            router.undo();
            expect(other.map.has("keep")).toBe(false);
            expect(router.undoDepth).toBe(0);
            router.redo();
            expect(other.map.get("keep")).toBe(1);
        });
    }

    it("does not resurrect entries after deliberate clear inside manual replay", () => {
        const router = new UndoRouter();
        const other = scope(router);
        other.map.set("keep", 1);
        router.captureManual(() => {}, { type: "manual", undo: () => router.clear(), redo: () => {} });
        router.undo();
        expect(router.undoDepth).toBe(0);
        expect(router.redoDepth).toBe(0);
        expect(other.map.get("keep")).toBe(1);
    });

    it("does not re-register a group whose owner ends during replay", () => {
        const router = new UndoRouter();
        const first = scope(router);
        const second = scope(router);
        router.captureCommand(() => {
            first.map.set("first", 1);
            second.map.set("second", 2);
        });
        second.doc.on("afterTransaction", transaction => {
            if (transaction.origin === second.undo) router.unregister(second.undo);
        });
        router.undo();
        expect(first.map.size).toBe(0);
        expect(second.map.size).toBe(0);
        expect(router.undoDepth).toBe(0);
        expect(router.redoDepth).toBe(0);
    });
});
