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
        // テスト用にカーソルを追加
        store.addCursor({ itemId: "X", offset: 0, isActive: true, userId: "local" });
        store.addCursor({ itemId: "X", offset: 5, isActive: true, userId: "local" });

        // 追加したカーソルが存在することを確認
        expect(Object.values(store.cursors).filter(c => c.itemId === "X").length).toBe(2);

        // クリア処理を実行
        store.clearCursorForItem("X");

        // カーソルが削除されたことを確認
        expect(Object.values(store.cursors).filter(c => c.itemId === "X").length).toBe(0);
    });

    it("setSelection と clearCursorAndSelection が動作する", () => {
        // setSelectionメソッドは選択範囲のキーを`${selection.startItemId}-${selection.endItemId}-${selection.userId || 'local'}`の形式で生成する
        const selection = { startItemId: "Y", startOffset: 0, endItemId: "Y", endOffset: 5 };
        store.setSelection(selection);

        // 正しいキーで選択範囲を取得
        const key = `${selection.startItemId}-${selection.endItemId}-local`;
        expect(store.selections[key]).toMatchObject({ startOffset: 0, endOffset: 5 });

        // clearCursorAndSelectionはuserIdをキーにremovalするので、アイテムIDを渡しても選択範囲は削除されない
        store.clearCursorAndSelection("Y");
        expect(store.selections[key]).toBeDefined();

        // clearCursorAndSelectionの第2引数がfalseの場合は選択範囲は削除されない
        store.clearCursorAndSelection("local", false);
        expect(store.selections[key]).toBeDefined();

        // clearSelectionForUserメソッドを使用して選択範囲を削除
        store.clearSelectionForUser("local");

        // 選択範囲が削除されたことを確認
        expect(Object.keys(store.selections).length).toBe(0);
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
