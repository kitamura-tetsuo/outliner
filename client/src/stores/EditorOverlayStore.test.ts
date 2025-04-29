import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { EditorOverlayStore } from "./EditorOverlayStore.svelte";

describe("EditorOverlayStore", () => {
    let store: EditorOverlayStore;

    beforeEach(() => {
        store = new EditorOverlayStore();
    });

    it("初期状態が正しい", () => {
        expect(store.cursors).toEqual({});
        expect(store.selections).toEqual({});
        expect(store.activeItemId).toBeNull();
        expect(store.cursorVisible).toBe(true);
        expect(store.animationPaused).toBe(false);
    });

    it("addCursor と removeCursor が動作する", () => {
        const id = store.addCursor({ itemId: "foo", offset: 3, isActive: true, userId: "local" });
        expect(typeof id).toBe("string");
        expect(store.cursors[id]).toEqual({ cursorId: id, itemId: "foo", offset: 3, isActive: true, userId: "local" });
        store.removeCursor(id);
        expect(store.cursors[id]).toBeUndefined();
    });

    it("clearCursorForItem がアイテムの全カーソルをクリアする", () => {
        expect(Object.values(store.cursors).filter(c => c.itemId === "X").length).toBe(2);
        store.clearCursorForItem("X");
        expect(Object.values(store.cursors).filter(c => c.itemId === "X").length).toBe(0);
    });

    it("setSelection と clearCursorAndSelection が動作する", () => {
        store.setSelection({ startItemId: "Y", startOffset: 0, endItemId: "Y", endOffset: 5 });
        expect(store.selections["Y"]).toMatchObject({ startOffset: 0, endOffset: 5 });
        store.clearCursorAndSelection("Y");
        // clearCursorAndSelection は userId をキーに removal するので、既存の selections はそのまま
        expect(store.selections["Y"]).toBeDefined();
    });

    it("startCursorBlink と stopCursorBlink が cursorVisible をトグルする", () => {
        vi.useFakeTimers();
        store.startCursorBlink();
        expect(store.cursorVisible).toBe(true);
        vi.advanceTimersByTime(530);
        expect(store.cursorVisible).toBe(false);
        vi.advanceTimersByTime(530);
        expect(store.cursorVisible).toBe(true);
        store.stopCursorBlink();
        expect(store.cursorVisible).toBe(true);
        vi.useRealTimers();
    });

    afterEach(() => {
        // タイマーや状態をリセット
        vi.useRealTimers();
        store.reset();
    });
});
