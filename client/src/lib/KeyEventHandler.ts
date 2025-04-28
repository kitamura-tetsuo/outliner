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
        const cursorInstances = store.getCursorInstances();
        cursorInstances.forEach(cursor => cursor.onInput(inputEvent));
    }
}
