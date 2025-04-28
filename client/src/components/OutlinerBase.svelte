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
});
</script>

<div class="outliner-base" data-testid="outliner-base">
    <GlobalTextArea />
    <OutlinerTree {pageItem} {isReadOnly} />
</div>
