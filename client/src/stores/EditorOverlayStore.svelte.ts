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
    selections = $state<Record<string, SelectionRange>>({});
    activeItemId = $state<string | null>(null);
    cursorVisible = $state<boolean>(true);
    animationPaused = $state<boolean>(false);

    private timerId!: ReturnType<typeof setTimeout>;

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
        this.cursors = { ...this.cursors, [cursor.cursorId]: cursor };
    }

    addCursor(omitProps: Omit<CursorPosition, "cursorId">) {
        const newId = this.genUUID();
        const newCursor: CursorPosition = { cursorId: newId, ...omitProps };
        this.updateCursor(newCursor);
        return newId;
    }

    removeCursor(cursorId: string) {
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

    clearCursorAndSelection(userId = "local") {
        // 指定した userId のカーソルのみ削除、選択範囲はそのまま保持
        this.cursors = Object.fromEntries(
            Object.entries(this.cursors).filter(([_, c]) => c.userId !== userId),
        );
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

    setCursor(cursorProps: Omit<CursorPosition, "cursorId">) {
        const id = this.genUUID();
        const newCursor: CursorPosition = { cursorId: id, ...cursorProps };
        this.cursors = { ...this.cursors, [id]: newCursor };
        return id;
    }

    clearCursorForItem(itemId: string) {
        Object.entries(this.cursors).forEach(([cursorId, cursor]: [string, CursorPosition]) => {
            if (cursor.itemId === itemId) {
                this.removeCursor(cursorId);
            }
        });
    }
}

export const editorOverlayStore = new EditorOverlayStore();
