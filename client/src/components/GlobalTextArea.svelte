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
</script>

<textarea
    bind:this={textareaRef}
    class="global-textarea"
    onkeydown={handleKeyDown}
    oninput={handleInput}
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
