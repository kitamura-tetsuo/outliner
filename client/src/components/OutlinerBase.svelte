<script lang="ts">
// 最初に実行されるログ
console.log("OutlinerBase script executed - console.log");

import type { Item } from "../schema/app-schema";
import OutlinerTree from "./OutlinerTree.svelte";

console.log("OutlinerBase imports completed");

interface Props {
    pageItem?: Item; // undefined を許容して常時マウント可能に
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

</div>

<style>
.outliner-base {
    width: 100%;
    height: 100%;
}
</style>
