<script lang="ts">
import type { Item } from "../schema/app-schema";
import { VISUAL_NODE_ROOT_ATTRIBUTE } from "../lib/selectionGeometry";
import { LAYOUT_COMPONENT_TYPE } from "../services/layout/layoutModel";

interface Props {
    componentType: string | undefined;
    item: Item;
}

let { componentType, item }: Props = $props();

/**
 * The wrapper is the visual node's root box (#5024): everything the block draws
 * lives inside it, so the editor overlay can highlight a selected Grid, Calendar
 * or Layout from this one rectangle without knowing what any of them render.
 */
const rootAttributes = $derived({ [VISUAL_NODE_ROOT_ATTRIBUTE]: item.id });
</script>

{#if componentType === "yjstable"}
    {#await import("./yjstable/YjsTableBlock.svelte") then { default: YjsTableBlock }}
        <div class="component-wrapper" {...rootAttributes}>
            <YjsTableBlock item={item} />
        </div>
    {/await}
{:else if componentType === "calendar"}
    {#await import("./calendar/CalendarBlock.svelte") then { default: CalendarBlock }}
        <div class="component-wrapper" {...rootAttributes}>
            <CalendarBlock item={item} />
        </div>
    {/await}
{:else if componentType === LAYOUT_COMPONENT_TYPE}
    {#await import("./layout/LayoutBlock.svelte") then { default: LayoutBlock }}
        <div class="component-wrapper" {...rootAttributes}>
            <LayoutBlock item={item} />
        </div>
    {/await}
{/if}

<style>
.component-wrapper {
    margin-top: 4px;
    width: 100%;
}
</style>
