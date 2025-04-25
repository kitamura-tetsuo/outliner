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

// reactive state variables
export let cursors: Record<string, CursorPosition> = {};
export let selections: Record<string, SelectionRange> = {};
export let activeItemId: string | null = null;
export let cursorVisible = true;
export let animationPaused = false;

// タイマーIDをブラウザの setTimeout 戻り値型で定義
let timerId: ReturnType<typeof setTimeout>;

// UUID 生成ユーティリティ: crypto.randomUUID がなければ getRandomValues で v4 UUID を生成
function genUUID(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // fallback: RFC4122 v4
    const bytes = (typeof crypto !== "undefined" ? crypto.getRandomValues(new Uint8Array(16)) : null) ||
        new Uint8Array(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex: string[] = Array.from(bytes).map(b => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${
        hex.slice(8, 10).join("")
    }-${hex.slice(10, 16).join("")}`;
}

// カーソル位置を設定（既存カーソルの更新 or 新規追加）
export function updateCursor(cursor: CursorPosition) {
    cursors = { ...cursors, [cursor.cursorId]: cursor };
}

// 新しいカーソルを追加し、一意IDを自動生成
export function addCursor(omitProps: Omit<CursorPosition, "cursorId">) {
    const newId = genUUID();
    const newCursor: CursorPosition = { cursorId: newId, ...omitProps };
    updateCursor(newCursor);
    return newId;
}

// カーソルを削除
export function removeCursor(cursorId: string) {
    const newCursors = { ...cursors };
    delete newCursors[cursorId];
    cursors = newCursors;
}

// 選択範囲を設定
export function setSelection(selection: SelectionRange) {
    const key = selection.startItemId;
    selections = { ...selections, [key]: selection };
}

// アクティブなアイテムを設定
export function setActiveItem(itemId: string | null) {
    activeItemId = itemId;
}

// 現在アクティブなアイテムIDを取得
export function getActiveItem(): string | null {
    return activeItemId;
}

// カーソル表示状態を設定
export function setCursorVisible(visible: boolean) {
    cursorVisible = visible;
}

// アニメーション一時停止状態を設定
export function setAnimationPaused(paused: boolean) {
    animationPaused = paused;
}

// カーソル点滅開始
export function startCursorBlink() {
    cursorVisible = true;
    animationPaused = true;
    clearTimeout(timerId);
    timerId = setTimeout(() => {
        if (document.hasFocus()) {
            animationPaused = false;
        }
    }, 500);
}

// カーソル点滅停止
export function stopCursorBlink() {
    cursorVisible = true;
    animationPaused = true;
    clearTimeout(timerId);
}

// カーソルと選択範囲をクリア
export function clearCursorAndSelection(userId = "local") {
    const newCursors = { ...cursors };
    const newSelections = { ...selections };
    delete newCursors[userId];
    delete newSelections[userId];
    cursors = newCursors;
    selections = newSelections;
}

// 特定のカーソルのみクリア
export function clearCursorInstance(cursorId: string) {
    removeCursor(cursorId);
}

// 全てのステートをリセット
export function reset() {
    cursors = {};
    selections = {};
    activeItemId = null;
    cursorVisible = true;
    animationPaused = false;
    clearTimeout(timerId);
}

// アイテムごとのカーソルと選択範囲を取得
export function getItemCursorsAndSelections(itemId: string) {
    const itemCursors = Object.values(cursors).filter(c => c.itemId === itemId);
    const itemSelections = Object.values(selections).filter(
        s => s.startItemId === itemId || s.endItemId === itemId,
    );
    const isActive = activeItemId === itemId;
    return { cursors: itemCursors, selections: itemSelections, isActive };
}

// setCursor: 一意の cursorId を自動生成してカーソルを追加・更新
export function setCursor(cursorProps: Omit<CursorPosition, "cursorId">) {
    const id = genUUID();
    const newCursor: CursorPosition = { cursorId: id, ...cursorProps };
    cursors = { ...cursors, [id]: newCursor };
    return id;
}

// legacy function: 特定アイテムに紐づくカーソルをクリア
export function clearCursorForItem(itemId: string) {
    Object.entries(cursors).forEach(([cursorId, cursor]) => {
        if (cursor.itemId === itemId) {
            removeCursor(cursorId);
        }
    });
}
