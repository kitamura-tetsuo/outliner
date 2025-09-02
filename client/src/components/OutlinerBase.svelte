<script lang="ts">
// 最初に実行されるログ
console.log("OutlinerBase script executed - console.log");

import type { Item } from "../schema/app-schema";
import { browser } from "$app/environment";
import AliasPicker from "./AliasPicker.svelte";
import GlobalTextArea from "./GlobalTextArea.svelte";
import OutlinerTree from "./OutlinerTree.svelte";
import PresenceAvatars from "./PresenceAvatars.svelte";
import SlashCommandPalette from "./SlashCommandPalette.svelte";

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

// Yjsのルーム名制約に合わせて安全なIDへ変換
function slugify(input: string): string {
    const s = (input || "").toString().trim().toLowerCase();
    const slug = s
        .replace(/[^a-z0-9_-]+/g, "-") // 許可外文字をハイフンに
        .replace(/-+/g, "-")           // 連続ハイフンを1つに
        .replace(/^-+|-+$/g, "");      // 先頭/末尾ハイフンを除去
    return slug || "default-project";
}

const yjsProjectId = $derived(slugify(projectName));


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
        {#if browser}
            {#key pageItem.id}
                <OutlinerTree
                    projectId={yjsProjectId}
                    pageId={pageItem.id as string}
                    projectName={projectName}
                    pageName={pageName}
                    isReadOnly={isReadOnly}
                    onEdit={onEdit}
                />
            {/key}

            <!-- グローバルテキストエリアやUIはブラウザ環境でのみ描画 -->
            <GlobalTextArea />
            <SlashCommandPalette />
            <AliasPicker />
            <PresenceAvatars />
        {:else}
            <div class="outliner-item">Loading...</div>
        {/if}
    {:else}
        <div class="outliner-item">Loading...</div>
    {/if}
</div>

<style>
.outliner-base {
    width: 100%;
    /* ビューポート基準の高さを確保して子要素（ツールバー等）が可視になるようにする */
    min-height: 60vh;
}
</style>
