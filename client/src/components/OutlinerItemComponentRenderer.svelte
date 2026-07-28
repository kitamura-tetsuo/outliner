<script lang="ts">
import type { Item } from "../schema/app-schema";

interface Props {
    componentType: string | undefined;
    item: Item;
}

let { componentType, item }: Props = $props();
</script>

{#if componentType === "yjstable"}
    {#await import("./yjstable/YjsTableBlock.svelte") then { default: YjsTableBlock }}
        <div class="component-wrapper">
            <YjsTableBlock item={item} />
        </div>
    {/await}
{:else if componentType === "calendar"}
    {#await import("./calendar/CalendarBlock.svelte") then { default: CalendarBlock }}
        <div class="component-wrapper">
            <CalendarBlock item={item} />
        </div>
    {/await}
{/if}

<style>
.component-wrapper {
    margin-top: 4px;
    width: 100%;
}
</style>
