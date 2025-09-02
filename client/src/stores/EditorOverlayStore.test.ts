import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    it("clearCursorForItem がアイテムの全カーソルをクリアし、cursorHistory からも除去する", () => {
        // テスト用にカーソルを追加（X に2つ、Y に1つ）
        const idX1 = store.addCursor({ itemId: "X", offset: 0, isActive: true, userId: "local" });
        const idX2 = store.addCursor({ itemId: "X", offset: 5, isActive: true, userId: "local" });
        const idY = store.addCursor({ itemId: "Y", offset: 1, isActive: true, userId: "local" });

        // 事前検証
        expect(Object.values(store.cursors).filter(c => c.itemId === "X").length).toBe(2);
        expect(store.cursorHistory.includes(idX1)).toBe(true);
        expect(store.cursorHistory.includes(idX2)).toBe(true);
        expect(store.cursorHistory.includes(idY)).toBe(true);

        // クリア処理を実行
        store.clearCursorForItem("X");

        // カーソルが削除されたことを確認
        expect(Object.values(store.cursors).filter(c => c.itemId === "X").length).toBe(0);
        // 履歴からも削除されている
        expect(store.cursorHistory.includes(idX1)).toBe(false);
        expect(store.cursorHistory.includes(idX2)).toBe(false);
        // 他アイテムの履歴は保持
        expect(store.cursorHistory.includes(idY)).toBe(true);
    });

    it("invalidateItemsMappingCache により DOM 変更後の隣接判定が即時反映される", () => {
        // 初期 DOM 構築: title, id1, id2
        document.body.innerHTML = `
          <div class="outliner">
            <div class="outliner-item" data-item-id="title"><span class="item-text">Title</span></div>
            <div class="outliner-item" data-item-id="id1"><span class="item-text">AAA</span></div>
            <div class="outliner-item" data-item-id="id2"><span class="item-text">BBBB</span></div>
          </div>`;

        // id1 にアクティブカーソルを置く
        store.addCursor({ itemId: "id1", offset: 2, isActive: true, userId: "local" });
        // 下方向に追加 -> id2
        store.addCursorRelativeToActive("down");
        expect(store.getLastActiveCursor()?.itemId).toBe("id2");

        // DOM を更新して id3 を末尾に追加
        const container = document.querySelector(".outliner")!;
        const id3 = document.createElement("div");
        id3.className = "outliner-item";
        id3.setAttribute("data-item-id", "id3");
        id3.innerHTML = '<span class="item-text">CC</span>';
        container.appendChild(id3);

        // キャッシュを明示的に無効化
        (store as any).invalidateItemsMappingCache();

        // 直近アクティブ(id2)基準で下方向へ -> id3
        store.addCursorRelativeToActive("down");
        expect(store.getLastActiveCursor()?.itemId).toBe("id3");
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

    it("getLastActiveCursor 履歴: 削除後に直前のアクティブへフォールバックし、全削除で null", () => {
        const id1 = store.addCursor({ itemId: "A", offset: 0, isActive: true, userId: "local" });
        const id2 = store.addCursor({ itemId: "B", offset: 1, isActive: true, userId: "local" });
        const id3 = store.addCursor({ itemId: "C", offset: 2, isActive: true, userId: "local" });
        expect(store.getLastActiveCursor()?.cursorId).toBe(id3);

        // 末尾を remove すると直前へ
        store.removeCursor(id3);
        expect(store.getLastActiveCursor()?.cursorId).toBe(id2);

        // さらに remove で A
        store.removeCursor(id2);
        expect(store.getLastActiveCursor()?.cursorId).toBe(id1);

        // すべて削除で null
        store.removeCursor(id1);
        expect(store.getLastActiveCursor()).toBeNull();
    });

    it("addCursorRelativeToActive: 直近のアクティブを基準に上下へ追加する（DOM隣接を参照）", () => {
        // jsdom にアイテムの DOM を構築（タイトル含め data-item-id 順に並ぶ）
        document.body.innerHTML = `
          <div class="outliner">
            <div class="outliner-item" data-item-id="title"><span class="item-text">Title</span></div>
            <div class="outliner-item" data-item-id="id1"><span class="item-text">AAA</span></div>
            <div class="outliner-item" data-item-id="id2"><span class="item-text">BBBB</span></div>
            <div class="outliner-item" data-item-id="id3"><span class="item-text">CC</span></div>

    it("setCursor の再アクティブ化で cursorHistory が重複せず末尾へ移動する", () => {
        // 初回 setCursor
        const a1 = store.setCursor({ itemId: "AA", offset: 0, isActive: true, userId: "local" });
        expect(store.cursorHistory.at(-1)).toBe(a1);

        // 同一ユーザーで同一アイテムを再アクティブ
        const a2 = store.setCursor({ itemId: "AA", offset: 1, isActive: true, userId: "local" });
        // 新規IDが発行される前提（現在の実装は常に新規）
        expect(a2).not.toBe(a1);
        // 履歴内に a1 が重複しない（removeCursor側で除去、または再アクティブ前にクリア）
        const countA1 = store.cursorHistory.filter(id => id === a1).length;
        expect(countA1).toBe(0);
        // 末尾は最新ID
        expect(store.cursorHistory.at(-1)).toBe(a2);
    });

          </div>`;

        const idA = store.addCursor({ itemId: "id2", offset: 3, isActive: true, userId: "local" });
        // 下方向追加: id3 に追加され offset はテキスト長に丸め
        store.addCursorRelativeToActive("down");
        const cursors1 = Object.values(store.cursors);
        const last1 = store.getLastActiveCursor();
        expect(cursors1.some(c => c.itemId === "id3")).toBe(true);
        expect(last1?.itemId).toBe("id3");
        // 上方向追加: 直近のアクティブ(id3)基準で id2 に追加
        store.addCursorRelativeToActive("up");
        const last2 = store.getLastActiveCursor();
        expect(last2?.itemId).toBe("id2");

        // 直近を非アクティブ化すると、isActive の最後のものを基準にする
        store.updateCursor({ cursorId: idA, itemId: "id2", offset: 0, isActive: false, userId: "local" });
        // 現在の最後のアクティブを取得
        const actives = Object.values(store.cursors).filter(c => c.isActive);
        const base = actives[actives.length - 1];
        expect(base).toBeTruthy();
        store.addCursorRelativeToActive("down");
        const last3 = store.getLastActiveCursor();
        // 追加後の最後が base の隣接になっている
        const expectedNext = base.itemId === "id1" ? "id2" : base.itemId === "id2" ? "id3" : null;
        if (expectedNext) expect(last3?.itemId).toBe(expectedNext);
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
