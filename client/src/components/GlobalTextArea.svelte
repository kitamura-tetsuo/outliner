<script lang="ts">
import { onMount } from "svelte";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";

let textareaRef: HTMLTextAreaElement;

// 初期化: フォーカスとイベントハンドラの設定
onMount(() => {
    textareaRef?.focus();
});

// store.activeItemId 変化時に再フォーカス
$effect(() => {
    const id = store.activeItemId;
    if (id && textareaRef) {
        textareaRef.focus();
    }
});

// キーダウンイベントをストアに伝搬
function handleKeyDown(event: any) {
    // マルチカーソルの左右移動
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const activeItemId = store.getActiveItem();
        if (activeItemId) {
            const { cursors } = store.getItemCursorsAndSelections(activeItemId);
            cursors.forEach(c => {
                const newOffset = event.key === "ArrowLeft"
                    ? Math.max(0, c.offset - 1)
                    : c.offset + 1;
                store.updateCursor({ ...c, offset: newOffset, isActive: true });
            });
        }
        store.startCursorBlink();
    }
    else {
        store.startCursorBlink();
    }
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
