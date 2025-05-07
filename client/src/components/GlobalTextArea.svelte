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
        textareaRef.focus();
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
