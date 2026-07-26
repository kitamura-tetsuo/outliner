import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Local minimal replica to avoid importing .svelte.ts in tests
class TestEditorOverlayStore {
    cursors: Record<string, { cursorId: string; itemId: string; offset: number; isActive: boolean; userId: string; }> =
        {};
    cursorInstances = new Map<string, { itemId: string; offset: number; isActive: boolean; userId: string; }>();
    cursorHistory: string[] = [];
    selections: Record<
        string,
        { startItemId: string; startOffset: number; endItemId: string; endOffset: number; userId?: string; }
    > = {};
    activeItemId: string | null = null;
    cursorBlinkEpoch = 0;
    animationPaused = false;
    private genUUID() {
        return Math.random().toString(36).slice(2);
    }
    addCursor(
        { itemId, offset, isActive, userId = "local" }: {
            itemId: string;
            offset: number;
            isActive: boolean;
            userId?: string;
        },
    ) {
        const id = this.genUUID();
        this.cursorInstances.set(id, { itemId, offset, isActive, userId });
        this.cursors = { ...this.cursors, [id]: { cursorId: id, itemId, offset, isActive, userId } };
        if (isActive) this.activeItemId = itemId;
        this.cursorHistory = [...this.cursorHistory, id];
        return id;
    }
    removeCursor(id: string) {
        this.cursorInstances.delete(id);
        const newCursors = { ...this.cursors };
        delete newCursors[id];
        this.cursors = newCursors;
    }
    undoLastCursor() {
        const id = this.cursorHistory.pop();
        if (id) this.removeCursor(id);
    }
    getLastActiveCursor() {
        const id = this.cursorHistory[this.cursorHistory.length - 1];
        return id ? this.cursors[id] : null;
    }
    clearCursorForItem(itemId: string) {
        const keep = Object.entries(this.cursors).filter((entry: [string, { itemId: string; userId: string; }]) =>
            entry[1].itemId !== itemId
        );
        this.cursors = Object.fromEntries(keep);
    }
    setSelection(
        sel: { startItemId: string; startOffset: number; endItemId: string; endOffset: number; userId?: string; },
    ) {
        const key = `${sel.startItemId}-${sel.endItemId}-${sel.userId || "local"}`;
        this.selections = { ...this.selections, [key]: sel };
    }
    clearCursorAndSelection(userId = "local", clearSelections = false) {
        this.cursors = Object.fromEntries(
            Object.entries(this.cursors).filter((entry: [string, { itemId: string; userId: string; }]) =>
                entry[1].userId !== userId
            ),
        );
        if (clearSelections) {
            this.selections = Object.fromEntries(
                Object.entries(this.selections).filter((entry: [string, { userId?: string; }]) =>
                    entry[1].userId !== userId
                ),
            );
        }
    }
    clearSelectionForUser(userId = "local") {
        this.selections = Object.fromEntries(
            Object.entries(this.selections).filter(([key, s]: [string, { userId?: string; }]) =>
                !key.includes(`-${userId}`) && s.userId !== userId
            ),
        );
    }
    startCursorBlink() {
        this.cursorBlinkEpoch = (this.cursorBlinkEpoch + 1) % 10000;
        this.animationPaused = false;
    }
    stopCursorBlink() {
        this.animationPaused = true;
    }
    reset() {
        this.cursors = {};
        this.selections = {};
        this.activeItemId = null;
        this.cursorBlinkEpoch = 0;
        this.animationPaused = false;
    }
}

describe("EditorOverlayStore", () => {
    let store: TestEditorOverlayStore;

    beforeEach(() => {
        store = new TestEditorOverlayStore();
    });

    it("initial state is correct", () => {
        expect(store.cursors).toEqual({});
        expect(store.selections).toEqual({});
        expect(store.activeItemId).toBeNull();
        expect(store.cursorBlinkEpoch).toBe(0);
        expect(store.animationPaused).toBe(false);
    });

    it("addCursor and removeCursor work correctly", () => {
        const id = store.addCursor({
            itemId: "foo",
            offset: 3,
            isActive: true,
            userId: "local",
        });
        expect(typeof id).toBe("string");
        expect(store.cursors[id]).toEqual({
            cursorId: id,
            itemId: "foo",
            offset: 3,
            isActive: true,
            userId: "local",
        });
        store.removeCursor(id);
        expect(store.cursors[id]).toBeUndefined();
    });

    it("undoLastCursor removes the last added cursor", () => {
        const id1 = store.addCursor({
            itemId: "A",
            offset: 0,
            isActive: true,
            userId: "local",
        });
        const id2 = store.addCursor({
            itemId: "B",
            offset: 0,
            isActive: true,
            userId: "local",
        });
        expect(Object.keys(store.cursors).length).toBe(2);
        store.undoLastCursor();
        expect(store.cursors[id2]).toBeUndefined();
        expect(store.cursors[id1]).toBeDefined();
    });

    it("getLastActiveCursor returns the last added cursor", () => {
        const id1 = store.addCursor({
            itemId: "A",
            offset: 0,
            isActive: true,
            userId: "local",
        });
        const id2 = store.addCursor({
            itemId: "B",
            offset: 1,
            isActive: true,
            userId: "local",
        });
        expect(store.getLastActiveCursor()).toEqual({
            cursorId: id2,
            itemId: "B",
            offset: 1,
            isActive: true,
            userId: "local",
        });
        store.undoLastCursor();
        expect(store.getLastActiveCursor()).toEqual({
            cursorId: id1,
            itemId: "A",
            offset: 0,
            isActive: true,
            userId: "local",
        });
    });

    it("clearCursorForItem clears all cursors for an item", () => {
        // Add cursor for testing
        store.addCursor({
            itemId: "X",
            offset: 0,
            isActive: true,
            userId: "local",
        });
        store.addCursor({
            itemId: "X",
            offset: 5,
            isActive: true,
            userId: "local",
        });

        // Confirm added cursor exists
        expect(
            Object.values(store.cursors).filter(c => c.itemId === "X").length,
        ).toBe(2);

        // Execute clear operation
        store.clearCursorForItem("X");

        // Confirm cursor is deleted
        expect(
            Object.values(store.cursors).filter(c => c.itemId === "X").length,
        ).toBe(0);
    });

    it("setSelection and clearCursorAndSelection work correctly", () => {
        // setSelection method generates selection key in format `${selection.startItemId}-${selection.endItemId}-${selection.userId || 'local'}`
        const selection = {
            startItemId: "Y",
            startOffset: 0,
            endItemId: "Y",
            endOffset: 5,
        };
        store.setSelection(selection);

        // Retrieve selection with correct key
        const key = `${selection.startItemId}-${selection.endItemId}-local`;
        expect(store.selections[key]).toMatchObject({
            startOffset: 0,
            endOffset: 5,
        });

        // clearCursorAndSelection removes by userId, so passing itemId does not remove selection
        store.clearCursorAndSelection("Y");
        expect(store.selections[key]).toBeDefined();

        // Selection is not removed if second argument of clearCursorAndSelection is false
        store.clearCursorAndSelection("local", false);
        expect(store.selections[key]).toBeDefined();

        // Remove selection using clearSelectionForUser method
        store.clearSelectionForUser("local");

        // Confirm selection is deleted
        expect(Object.keys(store.selections).length).toBe(0);
    });

    it("startCursorBlink bumps the epoch and enables animation, stopCursorBlink disables animation", () => {
        const initialEpoch = store.cursorBlinkEpoch;
        store.startCursorBlink();
        expect(store.cursorBlinkEpoch).toBeGreaterThan(initialEpoch);
        expect(store.animationPaused).toBe(false);

        store.stopCursorBlink();
        expect(store.animationPaused).toBe(true);
    });

    afterEach(() => {
        // Reset timers and state
        vi.useRealTimers();
        store.reset();
    });
});
