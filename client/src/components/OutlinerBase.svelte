<script lang="ts">
// 最初に実行されるログ
console.log("OutlinerBase script executed - console.log");

import type { Item } from "../schema/app-schema";
import AliasPicker from "./AliasPicker.svelte";
import GlobalTextArea from "./GlobalTextArea.svelte";
import OutlinerTree from "./OutlinerTree.svelte";
import PresenceAvatars from "./PresenceAvatars.svelte";
import SlashCommandPalette from "./SlashCommandPalette.svelte";
import { TreeSubscriber } from "../stores/TreeSubscriber";

console.log("OutlinerBase imports completed");

interface Props {
    pageItem: Item;
    projectName: string;
    pageName: string;
    isReadOnly?: boolean;
    isTemporary?: boolean;
    onEdit?: () => void;
}

let {
    pageItem,
    projectName,
    pageName,
    isReadOnly = false,
    isTemporary = false,
    onEdit,
}: Props = $props();

console.log("OutlinerBase props received:", {
    pageItemExists: !!pageItem,
    pageItemId: pageItem?.id,
    isTemporary,
    onEditExists: !!onEdit,
});

console.log("OutlinerBase script completed successfully");
</script>

<div class="outliner-base" data-testid="outliner-base">
    {#if pageItem}
        <OutlinerTree
            pageItem={pageItem}
            projectName={projectName}
            pageName={pageName}
            isReadOnly={isReadOnly}
            onEdit={onEdit}
        />
    {:else}
        <div class="outliner-item">Loading...</div>
    {/if}

    <!-- グローバルテキストエリア -->
    <GlobalTextArea />
    <SlashCommandPalette />
    <AliasPicker />
    <PresenceAvatars />
</div>

<style>
.outliner-base {
    width: 100%;
    height: 100%;
}
</style>
