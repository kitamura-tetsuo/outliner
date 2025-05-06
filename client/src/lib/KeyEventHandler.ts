import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";

/**
 * キーおよび入力イベントを各カーソルインスタンスに振り分けるハンドラ
 */
export class KeyEventHandler {
    /**
     * KeyDown イベントを各カーソルに委譲
     */
    static handleKeyDown(event: KeyboardEvent) {
        const cursorInstances = store.getCursorInstances();

        // カーソルがない場合は処理しない
        if (cursorInstances.length === 0) {
            return;
        }

        // フォーマットショートカットを処理
        if (event.ctrlKey) {
            // Ctrl+B: 太字
            if (event.key === 'b') {
                cursorInstances.forEach(cursor => cursor.formatBold());
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            // Ctrl+I: 斜体
            else if (event.key === 'i') {
                cursorInstances.forEach(cursor => cursor.formatItalic());
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            // Ctrl+U: 下線
            else if (event.key === 'u') {
                cursorInstances.forEach(cursor => cursor.formatUnderline());
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            // Ctrl+K: 取り消し線
            else if (event.key === 'k') {
                cursorInstances.forEach(cursor => cursor.formatStrikethrough());
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            // Ctrl+`: コード
            else if (event.key === '`') {
                cursorInstances.forEach(cursor => cursor.formatCode());
                event.preventDefault();
                event.stopPropagation();
                return;
            }
        }

        // 各カーソルインスタンスのonKeyDownメソッドを呼び出す
        let handled = false;
        for (const cursor of cursorInstances) {
            if (cursor.onKeyDown(event)) {
                handled = true;
            }
        }

        // 少なくとも1つのカーソルがイベントを処理した場合
        if (handled) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    /**
     * Input イベントを各カーソルに委譲
     */
    static handleInput(event: Event) {
        const inputEvent = event as InputEvent;
        // IME composition中の入力は重複処理を避けるため無視する
        if (inputEvent.isComposing || inputEvent.inputType.startsWith("insertComposition")) {
            return;
        }
        const cursorInstances = store.getCursorInstances();
        cursorInstances.forEach(cursor => cursor.onInput(inputEvent));
    }

    // 現在のcomposition文字数を保持
    static lastCompositionLength = 0;
    /**
     * IMEのcompositionupdateイベントを処理し、中間入力文字を表示する
     */
    static handleCompositionUpdate(event: CompositionEvent) {
        const data = event.data || "";
        const cursorInstances = store.getCursorInstances();
        // 以前の中間文字を削除
        if (KeyEventHandler.lastCompositionLength > 0) {
            cursorInstances.forEach(cursor => {
                for (let i = 0; i < KeyEventHandler.lastCompositionLength; i++) {
                    cursor.deleteBackward();
                }
            });
        }
        // 新しい中間文字を挿入
        if (data.length > 0) {
            cursorInstances.forEach(cursor => cursor.insertText(data));
        }
        KeyEventHandler.lastCompositionLength = data.length;
    }

    /**
     * IMEのcompositionendイベントを処理し、日本語入力を挿入する
     */
    static handleCompositionEnd(event: CompositionEvent) {
        const data = event.data || "";
        const cursorInstances = store.getCursorInstances();
        // 中間文字を削除
        if (KeyEventHandler.lastCompositionLength > 0) {
            cursorInstances.forEach(cursor => {
                for (let i = 0; i < KeyEventHandler.lastCompositionLength; i++) {
                    cursor.deleteBackward();
                }
            });
        }
        // 確定文字を挿入
        if (data.length > 0) {
            cursorInstances.forEach(cursor => cursor.insertText(data));
        }
        KeyEventHandler.lastCompositionLength = 0;
    }
}
