<script lang="ts">
import * as echarts from "echarts";
import { onMount } from "svelte";
import { queryStore } from "../services/sqlService";
import { initDb, runQuery } from "../services/sqlService";
import type { Item } from "../schema/app-schema";

interface Props {
    item?: Item;
}

let { item }: Props = $props();
let chartDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;
let hasData = $state(false);
let isInitialized = $state(false);
let cleanup: (() => void) | undefined;

onMount(() => {
    (async () => {
        try {
            await initDb();
            isInitialized = true;

            chart = echarts.init(chartDiv);

            // If an item is provided and has a chartQuery, run it
            if (item && item.chartQuery) {
                runQuery(item.chartQuery);
            }

            const unsub = queryStore.subscribe(update);
            cleanup = () => {
                unsub();
                chart?.dispose();
            };
        } catch (error) {
            console.error("Error initializing chart:", error);
        }
    })();

    return () => {
        cleanup?.();
    };
});

// Function to run the item's query when needed
async function runItemQuery() {
    if (item && item.chartQuery && isInitialized) {
        try {
            await initDb();
            runQuery(item.chartQuery);
        } catch (error) {
            console.error("Error running item query:", error);
        }
    }
}

// Run the query when the item changes
$effect(() => {
    if (item) {
        runItemQuery();
    }
});

function update(data: any) {
    if (!chart) return;
    hasData = data.rows.length > 0;
    if (!hasData) {
        chart.clear();
        return;
    }
    const columns = data.columnsMeta.map((c: any) => c.name);
    const option = {
        xAxis: { type: "category", data: data.rows.map((_: any, i: number) => i.toString()) },
        yAxis: { type: "value" },
        series: columns.map((col: string) => ({ type: "bar", data: data.rows.map((r: any) => r[col]) })),
    };
    chart.setOption(option, { notMerge: true });
}
</script>

<div class="chart-panel" bind:this={chartDiv} style="width: 100%; height: 300px; position: relative">
    {#if !isInitialized}
        <p class="loading" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)">Loading...</p>
    {:else if !hasData}
        <p class="no-data" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)">No data</p>
    {/if}
</div>
