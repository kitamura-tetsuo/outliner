<script lang="ts">
import type { Item } from "../schema/app-schema";
import ChartPanel from "./ChartPanel.svelte";
import ChartQueryEditor from "./ChartQueryEditor.svelte";
import HabitTracker from "./HabitTracker.svelte";
import InlineJoinTable from "./InlineJoinTable.svelte";
import SqlBlock from "./SqlBlock.svelte";
import SqlTableGrid from "./SqlTableGrid.svelte";
import TaskManager from "./TaskManager.svelte";
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
{:else if componentType === "table"}
    <div class="component-wrapper">
        <InlineJoinTable />
    </div>
{:else if componentType === "sqltable"}
    <div class="component-wrapper">
        <SqlTableGrid item={item} />
    </div>
{:else if componentType === "chart"}
    <div class="component-wrapper">
        <ChartQueryEditor item={item} />
        <ChartPanel item={item} />
    </div>
{:else if componentType === "sql"}
    <div class="component-wrapper">
        <SqlBlock item={item} />
    </div>
{:else if componentType === "tasks"}
    <div class="component-wrapper">
        <TaskManager item={item} />
    </div>
{:else if componentType === "habits"}
    <div class="component-wrapper">
        <HabitTracker item={item} />
    </div>
{/if}

<style>
.component-wrapper {
    margin-top: 4px;
    width: 100%;
}
</style>
