import { describe, expect, it, vi } from "vitest";
import { KeyEventHandler } from "./KeyEventHandler";

// editorOverlayStore のモック
const clearCursorAndSelection = vi.fn();
const setActiveItem = vi.fn();
const setCursor = vi.fn();
const clearSelections = vi.fn();
const getVisibleItemIds = vi.fn();
const getLastActiveCursor = vi.fn();

function installWindowMocks(ids: string[], activeItemId: string) {
    (globalThis as any).window = {
        generalStore: {
            currentPage: {
                items: {
                    _arr: [{ id: ids[1], text: "A" }, { id: ids[2], text: "B" }, { id: ids[3], text: "C" }],
                    at(i: number) {
                        return this._arr[i];
                    },
                    removeAt(i: number) {
                        this._arr.splice(i, 1);
                    },
                    addNode(_author: string, idx: number) {
                        const id = `new-${Math.random().toString(36).slice(2, 8)}`;
                        const node = { id, text: { toString: () => "X" }, updateText: vi.fn() };
                        this._arr.splice(idx, 0, node);
                        return node;
                    },
                },
            },
        },
        editorOverlayStore: {
            clearCursorAndSelection,
            setActiveItem,
            setCursor,
            clearSelections,
            getVisibleItemIds,
            getLastActiveCursor,
            cursors: {},
        },
        requestAnimationFrame: (cb: any) => setTimeout(cb, 0),
    } as any;

    getVisibleItemIds.mockReturnValue(ids);
    getLastActiveCursor.mockReturnValue({ itemId: activeItemId, offset: 0, isActive: true, userId: "local" });
}

describe("KeyEventHandler.reorderByKeyboard", () => {
    it("setCursor の再設定が多重発火しない（少なくとも連続2回まで）", async () => {
        const ids = ["title-id", "id-a", "id-b", "id-c"];
        installWindowMocks(ids, "id-b");

        // 呼び出し回数を計測
        setCursor.mockReset();
        setActiveItem.mockReset();
        clearCursorAndSelection.mockReset();
        clearSelections.mockReset();

        // down → up を連続実行
        (KeyEventHandler as any).reorderByKeyboard("down");
        (KeyEventHandler as any).reorderByKeyboard("up");

        // 非同期の ensure() を待つ
        await new Promise(r => setTimeout(r, 80));

        // setCursor が暴走的に増えていないこと（2方向×(初回+ensure)程度の上限）
        // 現実実装は最大4回程度。10回超の暴発はNGとみなす。
        expect(setCursor.mock.calls.length).toBeLessThanOrEqual(8);
        // clearSelections/clearCursorAndSelection も同様に過剰でない
        expect(clearCursorAndSelection.mock.calls.length).toBeLessThanOrEqual(8);
        expect(clearSelections.mock.calls.length).toBeLessThanOrEqual(8);
    });
});
