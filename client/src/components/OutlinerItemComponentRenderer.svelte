<script lang="ts">
import type { Item } from "../schema/app-schema";
import ChartPanel from "./ChartPanel.svelte";
import DynamicTableBlock from "./table/DynamicTableBlock.svelte";

interface Props {
    componentType: string | undefined;
    item: Item;
}

let { componentType, item }: Props = $props();
</script>

{#if componentType === "table" || componentType === "sqltable" || componentType === "sql" || componentType === "tasks" || componentType === "habits"}
    <div class="component-wrapper">
        <!-- Temporary legacy support for join tables before full deprecation -->
        <DynamicTableBlock item={item} />
    </div>
{:else if componentType === "chart"}
    <div class="component-wrapper">
        <ChartPanel item={item} />
    </div>
{/if}

<style>
.component-wrapper {
    margin-top: 4px;
    width: 100%;
}
</style>
