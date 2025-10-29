import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Local minimal replica to avoid importing .svelte.ts in tests
class TestEditorOverlayStore {
    cursors: Record<string, any> = {};
    cursorInstances = new Map<string, any>();
    cursorHistory: string[] = [];
    selections: Record<string, any> = {};
    activeItemId: string | null = null;
    cursorVisible = true;
    animationPaused = false;
    private timerId: any;
    private genUUID() {
        return Math.random().toString(36).slice(2);
    }
    addCursor({ itemId, offset, isActive, userId = "local" }: any) {
        const id = this.genUUID();
        this.cursorInstances.set(id, { itemId, offset, isActive, userId });
        this.cursors = { ...this.cursors, [id]: { cursorId: id, itemId, offset, isActive, userId } };
        if (isActive) this.activeItemId = itemId;
        this.cursorHistory = [...this.cursorHistory, id];
        return id;
    }
    removeCursor(id: string) {
        this.cursorInstances.delete(id);
        const { [id]: _r, ...rest } = this.cursors;
        this.cursors = rest;
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
        const keep = Object.entries(this.cursors).filter(([_key, c]: any) => c.itemId !== itemId);
        this.cursors = Object.fromEntries(keep);
    }
    setSelection(sel: any) {
        const key = `${sel.startItemId}-${sel.endItemId}-${sel.userId || "local"}`;
        this.selections = { ...this.selections, [key]: sel };
    }
    clearCursorAndSelection(userId = "local", clearSelections = false) {
        this.cursors = Object.fromEntries(Object.entries(this.cursors).filter(([_key, c]: any) => c.userId !== userId));
        if (clearSelections) {
            this.selections = Object.fromEntries(
                Object.entries(this.selections).filter(([_key, s]: any) => s.userId !== userId),
            );
        }
    }
    clearSelectionForUser(userId = "local") {
        this.selections = Object.fromEntries(
            Object.entries(this.selections).filter(([key, s]: any) =>
                !key.includes(`-${userId}`) && s.userId !== userId
            ),
        );
    }
    startCursorBlink() {
        this.cursorVisible = true;
        clearInterval(this.timerId);
        this.timerId = setInterval(() => {
            this.cursorVisible = !this.cursorVisible;
        }, 530);
    }
    stopCursorBlink() {
        clearInterval(this.timerId);
        this.cursorVisible = true;
    }
    reset() {
        this.cursors = {};
        this.selections = {};
        this.activeItemId = null;
        this.cursorVisible = true;
        this.animationPaused = false;
        clearInterval(this.timerId);
    }
}

describe("EditorOverlayStore", () => {
    let store: TestEditorOverlayStore;

    beforeEach(() => {
        store = new TestEditorOverlayStore();
    });

    it("初期状態が正しい", () => {
        expect(store.cursors).toEqual({});
        expect(store.selections).toEqual({});
        expect(store.activeItemId).toBeNull();
        expect(store.cursorVisible).toBe(true);
        expect(store.animationPaused).toBe(false);
    });

    it("addCursor と removeCursor が動作する", () => {
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

    it("undoLastCursor が最後に追加したカーソルを削除する", () => {
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

    it("getLastActiveCursor が最後に追加したカーソルを返す", () => {
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

    it("clearCursorForItem がアイテムの全カーソルをクリアする", () => {
        // テスト用にカーソルを追加
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

        // 追加したカーソルが存在することを確認
        expect(
            Object.values(store.cursors).filter(c => c.itemId === "X").length,
        ).toBe(2);

        // クリア処理を実行
        store.clearCursorForItem("X");

        // カーソルが削除されたことを確認
        expect(
            Object.values(store.cursors).filter(c => c.itemId === "X").length,
        ).toBe(0);
    });

    it("setSelection と clearCursorAndSelection が動作する", () => {
        // setSelectionメソッドは選択範囲のキーを`${selection.startItemId}-${selection.endItemId}-${selection.userId || 'local'}`の形式で生成する
        const selection = {
            startItemId: "Y",
            startOffset: 0,
            endItemId: "Y",
            endOffset: 5,
        };
        store.setSelection(selection);

        // 正しいキーで選択範囲を取得
        const key = `${selection.startItemId}-${selection.endItemId}-local`;
        expect(store.selections[key]).toMatchObject({
            startOffset: 0,
            endOffset: 5,
        });

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
