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
        switch (event.key) {
            case "ArrowLeft":
                cursorInstances.forEach(cursor => cursor.moveLeft());
                break;
            case "ArrowRight":
                cursorInstances.forEach(cursor => cursor.moveRight());
                break;
            case "Backspace":
                cursorInstances.forEach(cursor => cursor.deleteBackward());
                break;
            case "Delete":
                cursorInstances.forEach(cursor => cursor.deleteForward());
                break;
            case "Enter":
                if (event.shiftKey) {
                    cursorInstances.forEach(cursor => cursor.insertLineBreak());
                }
                else {
                    cursorInstances.forEach(cursor => cursor.insertLineBreak());
                }
                break;
            default:
                return;
        }
        store.startCursorBlink();
        event.preventDefault();
        event.stopPropagation();
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
