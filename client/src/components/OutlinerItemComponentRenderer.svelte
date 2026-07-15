<script lang="ts">
import type { Item } from "../schema/app-schema";
import YjsTableBlock from "./yjstable/YjsTableBlock.svelte";

interface Props {
    componentType: string | undefined;
    item: Item;
}

let { componentType, item }: Props = $props();
</script>

{#if componentType === "yjstable"}
    <div class="component-wrapper">
        <YjsTableBlock item={item} />
    </div>
{/if}

<style>
.component-wrapper {
    margin-top: 4px;
    width: 100%;
}
</style>
