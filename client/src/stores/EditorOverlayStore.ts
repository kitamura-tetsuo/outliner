import {
    derived,
    type Readable,
    writable,
} from "svelte/store";

export interface CursorPosition {
    itemId: string;
    offset: number;
    isActive: boolean;
    userId?: string;
    userName?: string;
    color?: string;
}

export interface SelectionRange {
    itemId: string;
    startOffset: number;
    endOffset: number;
    userId?: string;
    userName?: string;
    color?: string;
    isReversed?: boolean;
}

interface EditorOverlayState {
    cursors: Record<string, CursorPosition>; // key: userId
    selections: Record<string, SelectionRange>; // key: userId
    activeItemId: string | null;
}

const createEditorOverlayStore = () => {
    const initialState: EditorOverlayState = {
        cursors: {},
        selections: {},
        activeItemId: null,
    };

    const { subscribe, update, set } = writable<EditorOverlayState>(initialState);

    return {
        subscribe,

        // カーソル位置を設定
        setCursor: (cursor: CursorPosition) => {
            update(state => {
                const userId = cursor.userId || "local";
                return {
                    ...state,
                    cursors: {
                        ...state.cursors,
                        [userId]: cursor,
                    },
                };
            });
        },

        // 選択範囲を設定
        setSelection: (selection: SelectionRange) => {
            update(state => {
                const userId = selection.userId || "local";
                return {
                    ...state,
                    selections: {
                        ...state.selections,
                        [userId]: selection,
                    },
                };
            });
        },

        // アクティブなアイテムを設定
        setActiveItem: (itemId: string | null) => {
            update(state => ({
                ...state,
                activeItemId: itemId,
            }));
        },

        // 現在アクティブなアイテムIDを取得
        getActiveItem: () => {
            let activeItemId: string | null = null;
            update(state => {
                activeItemId = state.activeItemId;
                return state;
            });
            return activeItemId;
        },

        // カーソル位置と選択範囲をクリア
        clearCursorAndSelection: (userId = "local") => {
            update(state => {
                const newCursors = { ...state.cursors };
                const newSelections = { ...state.selections };
                delete newCursors[userId];
                delete newSelections[userId];

                return {
                    ...state,
                    cursors: newCursors,
                    selections: newSelections,
                };
            });
        },

        // 特定のアイテムのカーソルのみをクリア
        clearCursorForItem: (itemId: string, userId = "local") => {
            update(state => {
                // 指定されたユーザーのカーソルが該当アイテムにある場合のみクリア
                const cursor = state.cursors[userId];
                if (cursor && cursor.itemId === itemId) {
                    const newCursors = { ...state.cursors };
                    delete newCursors[userId];

                    return {
                        ...state,
                        cursors: newCursors,
                    };
                }
                return state;
            });
        },

        // 全てのカーソルと選択範囲をリセット
        reset: () => {
            set(initialState);
        },
    };
};

// シングルトンインスタンスを作成
export const editorOverlayStore = createEditorOverlayStore();

// 特定のアイテムに関連するカーソルと選択範囲を取得するためのヘルパー関数
export function getItemCursorsAndSelections(itemId: string): Readable<{
    cursors: CursorPosition[];
    selections: SelectionRange[];
    isActive: boolean;
}> {
    return derived(editorOverlayStore, $store => {
        const cursors = Object.values($store.cursors)
            .filter(cursor => cursor.itemId === itemId);

        const selections = Object.values($store.selections)
            .filter(selection => selection.itemId === itemId);

        const isActive = $store.activeItemId === itemId;

        return { cursors, selections, isActive };
    });
}
