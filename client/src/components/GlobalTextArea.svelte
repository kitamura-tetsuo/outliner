<script lang="ts">
import {
    onDestroy,
    onMount,
} from "svelte";
import { KeyEventHandler } from "../lib/KeyEventHandler";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";

let textareaRef: HTMLTextAreaElement;

// store.activeItemId 変化時に再フォーカス
$effect(() => {
    const id = store.activeItemId;
    console.log(`GlobalTextArea: activeItemId changed to ${id}`);
    if (id && textareaRef) {
        console.log(`GlobalTextArea: Setting focus for activeItemId ${id}`);

        // フォーカスを確実に設定するための複数の試行
        textareaRef.focus();
        console.log(`GlobalTextArea: Initial focus call, activeElement: ${document.activeElement?.tagName}`);

        // requestAnimationFrameを使用してフォーカスを設定
        requestAnimationFrame(() => {
            textareaRef.focus();
            console.log(`GlobalTextArea: RAF focus call, activeElement: ${document.activeElement?.tagName}`);

            // さらに確実にするためにsetTimeoutも併用
            setTimeout(() => {
                textareaRef.focus();
                const isFocused = document.activeElement === textareaRef;
                console.log(`GlobalTextArea: Final focus call, focused: ${isFocused}`);

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `GlobalTextArea: focus set on activeItemId change. Active element is textarea: ${isFocused}`,
                    );
                }
            }, 10);
        });
    }
});

// global textarea をストアに登録
onMount(() => {
    store.setTextareaRef(textareaRef);
    console.log("GlobalTextArea: Textarea reference set in store");

    // 初期フォーカスを設定
    textareaRef.focus();
    console.log("GlobalTextArea: Initial focus set on mount, activeElement:", document.activeElement?.tagName);

    // フォーカス確保のための追加試行
    requestAnimationFrame(() => {
        textareaRef.focus();
        console.log("GlobalTextArea: RAF focus set, activeElement:", document.activeElement?.tagName);

        setTimeout(() => {
            textareaRef.focus();
            const isFocused = document.activeElement === textareaRef;
            console.log("GlobalTextArea: Final focus set, focused:", isFocused);
        }, 10);
    });

    // テスト用にKeyEventHandlerをグローバルに公開
    if (typeof window !== "undefined") {
        (window as any).__KEY_EVENT_HANDLER__ = KeyEventHandler;
    }
});

onDestroy(() => {
    store.setTextareaRef(null);
});

// キーダウンイベントを KeyEventHandler へ委譲
function handleKeyDown(event: KeyboardEvent) {
    console.log("GlobalTextArea.handleKeyDown called with key:", event.key);
    console.log("GlobalTextArea.handleKeyDown: event.target:", event.target);
    console.log("GlobalTextArea.handleKeyDown: textareaRef:", textareaRef);
    console.log("GlobalTextArea.handleKeyDown: activeElement:", document.activeElement);
    KeyEventHandler.handleKeyDown(event);
}

// 入力イベントを KeyEventHandler へ委譲
function handleInput(event: Event) {
    console.log("GlobalTextArea.handleInput called with event:", event);
    console.log("GlobalTextArea.handleInput: event.target:", event.target);
    console.log("GlobalTextArea.handleInput: textareaRef:", textareaRef);
    console.log("GlobalTextArea.handleInput: activeElement:", document.activeElement);
    KeyEventHandler.handleInput(event);
}

// CompositionEnd イベントを KeyEventHandler へ委譲
function handleCompositionEnd(event: CompositionEvent) {
    KeyEventHandler.handleCompositionEnd(event);
}

// CompositionUpdate イベントを KeyEventHandler へ委譲
function handleCompositionUpdate(event: CompositionEvent) {
    KeyEventHandler.handleCompositionUpdate(event);
}

// コピーイベントを KeyEventHandler へ委譲
function handleCopy(event: ClipboardEvent) {
    KeyEventHandler.handleCopy(event);
}

// ペーストイベントを KeyEventHandler へ委譲
function handlePaste(event: ClipboardEvent) {
    KeyEventHandler.handlePaste(event);
}

// フォーカス喪失時の処理を追加
function handleBlur(_event: FocusEvent) {
    const activeItemId = store.getActiveItem();
    if (activeItemId) {
        // フォーカスを確実に設定するための複数の試行
        setTimeout(() => {
            textareaRef.focus();

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `GlobalTextArea: focus restored after blur. Active element is textarea: ${
                        document.activeElement === textareaRef
                    }`,
                );
            }
        }, 10);
    }
}
</script>

<textarea
    bind:this={textareaRef}
    class="global-textarea"
    onkeydown={handleKeyDown}
    oninput={handleInput}
    oncompositionupdate={handleCompositionUpdate}
    oncompositionend={handleCompositionEnd}
    oncopy={handleCopy}
    onpaste={handlePaste}
    onblur={handleBlur}
></textarea>

<style>
.global-textarea {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
}
</style>
