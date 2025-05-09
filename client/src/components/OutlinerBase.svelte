<script lang="ts">
import { onMount } from "svelte";
import type { Item } from "../schema/app-schema";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import { fluidStore } from "../stores/fluidStore.svelte";
import GlobalTextArea from "./GlobalTextArea.svelte";
import OutlinerTree from "./OutlinerTree.svelte";

interface Props {
    pageItem: Item;
    isReadOnly?: boolean;
}
let { pageItem, isReadOnly = false }: Props = $props();

onMount(() => {
    // editorOverlayStoreをリセットして初期カーソルを設定
    editorOverlayStore.reset();
    editorOverlayStore.setActiveItem(pageItem.id);
    const offset = pageItem.text?.length ?? 0;
    const userId = fluidStore.currentUser?.id ?? "anonymous";
    editorOverlayStore.addCursor({ itemId: pageItem.id, offset, isActive: true, userId });

    // アプリケーション起動時にグローバルテキストエリアにフォーカスを設定
    // 確実にフォーカスを設定するために複数の方法を使用
    setTimeout(() => {
        const textarea = editorOverlayStore.getTextareaRef();
        if (textarea) {
            // 直接フォーカスを設定
            textarea.focus();

            // requestAnimationFrameを使用してフォーカスを設定
            requestAnimationFrame(() => {
                textarea.focus();

                // さらに確実にするためにsetTimeoutも併用
                setTimeout(() => {
                    textarea.focus();

                    // デバッグ情報
                    if (typeof window !== 'undefined' && (window as any).DEBUG_MODE) {
                        console.log(`OutlinerBase: Initial focus set on global textarea. Active element is textarea: ${document.activeElement === textarea}`);
                    }
                }, 10);
            });
        }
    }, 100); // コンポーネントが完全にマウントされるのを待つ
});
</script>

<div class="outliner-base" data-testid="outliner-base">
    <GlobalTextArea />
    <OutlinerTree {pageItem} {isReadOnly} />
</div>
