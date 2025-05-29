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
    if (id && textareaRef) {
        // フォーカスを確実に設定するための複数の試行
        textareaRef.focus();

        // requestAnimationFrameを使用してフォーカスを設定
        requestAnimationFrame(() => {
            textareaRef.focus();

            // さらに確実にするためにsetTimeoutも併用
            setTimeout(() => {
                textareaRef.focus();

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `GlobalTextArea: focus set on activeItemId change. Active element is textarea: ${
                            document.activeElement === textareaRef
                        }`,
                    );
                }
            }, 10);
        });
    }
});

// global textarea をストアに登録
onMount(() => {
    store.setTextareaRef(textareaRef);
});

onDestroy(() => {
    store.setTextareaRef(null);
});

// キーダウンイベントを KeyEventHandler へ委譲
function handleKeyDown(event: KeyboardEvent) {
    KeyEventHandler.handleKeyDown(event);
}

// 入力イベントを KeyEventHandler へ委譲
function handleInput(event: Event) {
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
    on:keydown={handleKeyDown}
    on:input={handleInput}
    on:compositionupdate={handleCompositionUpdate}
    on:compositionend={handleCompositionEnd}
    on:copy={handleCopy}
    on:paste={handlePaste}
    on:blur={handleBlur}
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
