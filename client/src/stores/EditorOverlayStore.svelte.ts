import { Cursor } from "../lib/Cursor"; // Cursor クラスを import

// Exported types
export interface CursorPosition {
    // 各カーソルインスタンスを一意に識別するID
    cursorId: string;
    // カーソルが属するアイテムのID
    itemId: string;
    // テキストオフセット
    offset: number;
    // このカーソルがアクティブ（点滅中）かどうか
    isActive: boolean;
    // 任意のユーザー識別（将来対応用）
    userId?: string;
    userName?: string;
    color?: string;
}

export interface SelectionRange {
    // 選択範囲の開始アイテムID
    startItemId: string;
    // 開始オフセット
    startOffset: number;
    // 選択範囲の終了アイテムID
    endItemId: string;
    // 終了オフセット
    endOffset: number;
    // ユーザー識別用
    userId?: string;
    userName?: string;
    // 選択が逆方向か
    isReversed?: boolean;
    color?: string;
}

// Svelte 5 ランタイムの runes マクロを利用 (import は不要)

export class EditorOverlayStore {
    cursors = $state<Record<string, CursorPosition>>({});
    // Cursor インスタンスを保持する Map
    cursorInstances = new Map<string, Cursor>();
    selections = $state<Record<string, SelectionRange>>({});
    activeItemId = $state<string | null>(null);
    cursorVisible = $state<boolean>(true);
    animationPaused = $state<boolean>(false);
    // GlobalTextArea の textarea 要素を保持
    textareaRef = $state<HTMLTextAreaElement | null>(null);

    private timerId!: ReturnType<typeof setTimeout>;

    // テキストエリア参照を設定
    setTextareaRef(el: HTMLTextAreaElement | null) {
        this.textareaRef = el;
    }

    // テキストエリア参照を取得
    getTextareaRef(): HTMLTextAreaElement | null {
        return this.textareaRef;
    }

    private genUUID(): string {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        const bytes = (typeof crypto !== "undefined" ? crypto.getRandomValues(new Uint8Array(16)) : null) ||
            new Uint8Array(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex: string[] = Array.from(bytes).map(b => b.toString(16).padStart(2, "0"));
        return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${
            hex.slice(8, 10).join("")
        }-${hex.slice(10, 16).join("")}`;
    }

    updateCursor(cursor: CursorPosition) {
        // Map のインスタンスと同期
        const inst = this.cursorInstances.get(cursor.cursorId);
        if (inst) {
            // 既存のインスタンスを更新
            inst.itemId = cursor.itemId;
            inst.offset = cursor.offset;
            inst.isActive = cursor.isActive;
            if (cursor.userId) inst.userId = cursor.userId;
        } else {
            // インスタンスが存在しない場合は新しく作成
            const newInst = new Cursor(cursor.cursorId, {
                itemId: cursor.itemId,
                offset: cursor.offset,
                isActive: cursor.isActive,
                userId: cursor.userId ?? "local",
            });
            this.cursorInstances.set(cursor.cursorId, newInst);
        }

        // Reactive state を更新
        this.cursors = { ...this.cursors, [cursor.cursorId]: cursor };

        // アクティブアイテムを更新
        if (cursor.isActive) {
            this.setActiveItem(cursor.itemId);
        }
    }

    addCursor(omitProps: Omit<CursorPosition, "cursorId">) {
        const newId = this.genUUID();
        // Cursor インスタンスを生成して保持
        const cursorInst = new Cursor(newId, {
            itemId: omitProps.itemId,
            offset: omitProps.offset,
            isActive: omitProps.isActive,
            userId: omitProps.userId ?? "local",
        });
        this.cursorInstances.set(newId, cursorInst);
        const newCursor: CursorPosition = { cursorId: newId, ...omitProps };
        this.updateCursor(newCursor);
        return newId;
    }

    removeCursor(cursorId: string) {
        // Map からインスタンスを削除
        this.cursorInstances.delete(cursorId);
        // Reactive state からも削除
        const newCursors = { ...this.cursors };
        delete newCursors[cursorId];
        this.cursors = newCursors;
    }

    setSelection(selection: SelectionRange) {
        const key = selection.startItemId;
        this.selections = { ...this.selections, [key]: selection };
    }

    setActiveItem(itemId: string | null) {
        this.activeItemId = itemId;
    }

    getActiveItem(): string | null {
        return this.activeItemId;
    }

    setCursorVisible(visible: boolean) {
        this.cursorVisible = visible;
    }

    setAnimationPaused(paused: boolean) {
        this.animationPaused = paused;
    }

    startCursorBlink() {
        this.cursorVisible = true;
        clearInterval(this.timerId);
        // 単純に toggle するので Node でも動作
        this.timerId = setInterval(() => {
            this.cursorVisible = !this.cursorVisible;
        }, 530);
    }

    stopCursorBlink() {
        clearInterval(this.timerId);
        this.cursorVisible = true;
    }

    /**
     * 指定したユーザーのカーソルをすべて削除する
     * @param userId ユーザーID（デフォルトは"local"）
     * @param clearSelections 選択範囲も削除するかどうか（デフォルトはfalse）
     */
    clearCursorAndSelection(userId = "local", clearSelections = false) {
        // 削除対象のカーソルIDを収集
        const cursorIdsToRemove: string[] = [];

        // Map から一致するインスタンスを特定
        for (const [cursorId, inst] of this.cursorInstances.entries()) {
            if (inst.userId === userId) {
                cursorIdsToRemove.push(cursorId);
            }
        }

        // 特定したカーソルをすべて削除
        if (cursorIdsToRemove.length > 0) {
            // Map からインスタンスを削除
            cursorIdsToRemove.forEach(id => {
                this.cursorInstances.delete(id);
            });
        }

        // Reactive state を更新
        this.cursors = Object.fromEntries(
            Object.entries(this.cursors).filter(([_, c]) => c.userId !== userId),
        );

        // 選択範囲も削除する場合
        if (clearSelections) {
            this.selections = Object.fromEntries(
                Object.entries(this.selections).filter(([_, s]) => s.userId !== userId),
            );
        }
    }

    clearCursorInstance(cursorId: string) {
        this.removeCursor(cursorId);
    }

    reset() {
        this.cursors = {};
        this.selections = {};
        this.activeItemId = null;
        this.cursorVisible = true;
        this.animationPaused = false;
        clearTimeout(this.timerId);
    }

    getItemCursorsAndSelections(itemId: string) {
        const itemCursors = Object.values(this.cursors).filter((c: CursorPosition) => c.itemId === itemId);
        const itemSelections = Object.values(this.selections).filter(
            (s: SelectionRange) => s.startItemId === itemId || s.endItemId === itemId,
        );
        const isActive = this.activeItemId === itemId;
        return { cursors: itemCursors, selections: itemSelections, isActive };
    }

    /**
     * 新しいカーソルを設定する
     * @param cursorProps カーソルのプロパティ
     * @returns 新しいカーソルのID
     */
    setCursor(cursorProps: Omit<CursorPosition, "cursorId">) {
        const userId = cursorProps.userId ?? "local";
        const itemId = cursorProps.itemId;

        // 同じユーザーの同じアイテムに対する既存のカーソルをクリア
        const cursorIdsToRemove: string[] = [];
        for (const [cursorId, inst] of this.cursorInstances.entries()) {
            if (inst.userId === userId && inst.itemId === itemId) {
                cursorIdsToRemove.push(cursorId);
            }
        }

        // 特定したカーソルをすべて削除
        if (cursorIdsToRemove.length > 0) {
            // Map からインスタンスを削除
            cursorIdsToRemove.forEach(id => {
                this.cursorInstances.delete(id);
            });

            // Reactive state を更新
            const newCursors = { ...this.cursors };
            cursorIdsToRemove.forEach(id => {
                delete newCursors[id];
            });
            this.cursors = newCursors;
        }

        // 新しいカーソルを作成
        const id = this.genUUID();

        // Cursor インスタンスを生成して保持
        const cursorInst = new Cursor(id, {
            itemId: cursorProps.itemId,
            offset: cursorProps.offset,
            isActive: cursorProps.isActive,
            userId: userId,
        });
        this.cursorInstances.set(id, cursorInst);

        // Reactive state を更新
        const newCursor: CursorPosition = {
            cursorId: id,
            ...cursorProps,
            userId: userId // userId が undefined の場合に "local" を設定
        };
        this.cursors = { ...this.cursors, [id]: newCursor };

        // アクティブなカーソルの場合はアクティブアイテムを更新
        if (cursorProps.isActive) {
            this.setActiveItem(itemId);
        }

        return id;
    }

    clearCursorForItem(itemId: string) {
        // 削除対象のカーソルIDを収集
        const cursorIdsToRemove: string[] = [];

        // Map から一致するインスタンスを特定
        for (const [cursorId, inst] of this.cursorInstances.entries()) {
            if (inst.itemId === itemId) {
                cursorIdsToRemove.push(cursorId);
            }
        }

        // 特定したカーソルをすべて削除
        if (cursorIdsToRemove.length > 0) {
            // Map からインスタンスを削除
            cursorIdsToRemove.forEach(id => {
                this.cursorInstances.delete(id);
            });

            // Reactive state を一度に更新
            const newCursors = { ...this.cursors };
            cursorIdsToRemove.forEach(id => {
                delete newCursors[id];
            });
            this.cursors = newCursors;
        }
    }

    // 登録された Cursor インスタンスを取得する
    getCursorInstances(): import("../lib/Cursor").Cursor[] {
        return Array.from(this.cursorInstances.values());
    }
}

export const editorOverlayStore = new EditorOverlayStore();
