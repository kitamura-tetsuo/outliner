<script lang="ts">
import { onMount } from "svelte";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";

let textareaRef: HTMLTextAreaElement;

// 初期化: フォーカスとイベントハンドラの設定
onMount(() => {
    if (textareaRef) {
        textareaRef.focus();
    }
});

// キーダウンイベントをストアに伝搬
function handleKeyDown(event: any) {
    store.startCursorBlink();
    // その他キー操作はOutlinerItem側でstoreを通じてハンドリングされる想定
}

// 入力イベントをストア経由でテキスト更新
function handleInput(event: any) {
    // 実装は後続で具体化
}
</script>

<textarea
    bind:this={textareaRef}
    class="global-textarea"
    on:keydown={handleKeyDown}
    on:input={handleInput}
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
