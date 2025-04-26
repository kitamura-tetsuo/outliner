<script lang="ts">
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";

let textareaRef: HTMLTextAreaElement;

// store.activeItemId 変化時に再フォーカス
$effect(() => {
    const id = store.activeItemId;
    if (id && textareaRef) {
        textareaRef.focus();
    }
});

// キーダウンイベントをストアに伝搬
function handleKeyDown(event: any) {
    // ←→キー押下時のカーソル移動
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const activeItemId = store.getActiveItem();
        if (!activeItemId) return;
        const { cursors } = store.getItemCursorsAndSelections(activeItemId);
        // 全カーソルが行頭なら前アイテムへ移動
        if (event.key === "ArrowLeft" && cursors.every(c => c.offset === 0)) {
            const els = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const ids = els.map(el => el.getAttribute("data-item-id")!);
            const idx = ids.indexOf(activeItemId);
            if (idx > 0) {
                const newId = ids[idx - 1];
                store.clearCursorForItem(activeItemId);
                store.setActiveItem(newId);
                const textEl = document.querySelector(`[data-item-id="${newId}"] .item-text`) as HTMLElement;
                const len = textEl?.textContent?.length || 0;
                store.addCursor({ itemId: newId, offset: len, isActive: true, userId: "local" });
                store.startCursorBlink();
                return;
            }
        }
        // 全カーソルが行末なら次アイテムへ移動
        if (
            event.key === "ArrowRight" && cursors.every(c => {
                const curEl = document.querySelector(`[data-item-id="${activeItemId}"] .item-text`) as HTMLElement;
                const curLen = curEl?.textContent?.length || 0;
                return c.offset === curLen;
            })
        ) {
            const els = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const ids = els.map(el => el.getAttribute("data-item-id")!);
            const idx = ids.indexOf(activeItemId);
            if (idx >= 0 && idx < ids.length - 1) {
                const newId = ids[idx + 1];
                store.clearCursorForItem(activeItemId);
                store.setActiveItem(newId);
                store.addCursor({ itemId: newId, offset: 0, isActive: true, userId: "local" });
                store.startCursorBlink();
                return;
            }
        }
        // 同アイテム内での左右移動
        cursors.forEach(c => {
            const newOffset = event.key === "ArrowLeft"
                ? Math.max(0, c.offset - 1)
                : c.offset + 1;
            store.updateCursor({ ...c, offset: newOffset, isActive: true });
        });
        store.startCursorBlink();
        return;
    }
    // その他のキーは点滅のみ連動
    store.startCursorBlink();
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
