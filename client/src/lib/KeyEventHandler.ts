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
            // Ctrl+C: コピー
            else if (event.key === 'c') {
                // コピーイベントはデフォルトの動作を許可
                // handleCopyメソッドがClipboardEventを処理
                return;
            }
            // Ctrl+V: ペースト
            else if (event.key === 'v') {
                // ペーストイベントはデフォルトの動作を許可
                // handlePasteメソッドがClipboardEventを処理
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

    /**
     * コピーイベントを処理する
     * @param event ClipboardEvent
     */
    static handleCopy(event: ClipboardEvent) {
        // デバッグ情報
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`KeyEventHandler.handleCopy called`);
        }

        // 選択範囲がない場合は何もしない
        const selections = Object.values(store.selections).filter(sel =>
            sel.startOffset !== sel.endOffset || sel.startItemId !== sel.endItemId
        );

        if (selections.length === 0) return;

        // ブラウザのデフォルトコピー動作を防止
        event.preventDefault();

        // 選択範囲のテキストを取得
        const selectedText = store.getSelectedText('local');

        // デバッグ情報
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Selected text from store: "${selectedText}"`);
        }

        // 選択範囲のテキストが取得できた場合
        if (selectedText) {
            // クリップボードに書き込み
            if (event.clipboardData) {
                event.clipboardData.setData('text/plain', selectedText);
            }

            // グローバル変数に保存（テスト用）
            if (typeof window !== 'undefined') {
                (window as any).lastCopiedText = selectedText;
            }

            // デバッグ情報
            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Clipboard updated with: "${selectedText}"`);
            }
            return;
        }
    }

    /**
     * ペーストイベントを処理する
     * @param event ClipboardEvent
     */
    static handlePaste(event: ClipboardEvent) {
        // デバッグ情報
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`KeyEventHandler.handlePaste called`);
        }

        const text = event.clipboardData?.getData('text/plain') || '';
        if (!text) return;

        // デバッグ情報
        if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
            console.log(`Pasting text: "${text}"`);
        }

        // ブラウザのデフォルトペースト動作を防止
        event.preventDefault();

        // グローバル変数に保存（テスト用）
        if (typeof window !== 'undefined') {
            (window as any).lastPastedText = text;
        }

        // 選択範囲がある場合は、選択範囲を削除してからペースト
        const selections = Object.values(store.selections).filter(sel =>
            sel.startOffset !== sel.endOffset || sel.startItemId !== sel.endItemId
        );

        // 複数行テキストの場合はマルチアイテムペーストとみなす
        if (text.includes('\n')) {
            const lines = text.split(/\r?\n/);

            // デバッグ情報
            if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                console.log(`Multi-line paste detected, lines:`, lines);
            }

            // 複数行テキストの処理（現在は単純に最初の行のみを挿入）
            const firstLine = lines[0] || '';
            const cursorInstances = store.getCursorInstances();
            cursorInstances.forEach(cursor => cursor.insertText(firstLine));
            return;
        }

        // 単一行テキストの場合は、カーソル位置に挿入
        const cursorInstances = store.getCursorInstances();
        cursorInstances.forEach(cursor => cursor.insertText(text));
    }
}
