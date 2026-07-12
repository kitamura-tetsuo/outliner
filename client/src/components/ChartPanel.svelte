<script lang="ts">
import { getLogger } from "../lib/logger";
const logger = getLogger("ChartPanel");

import * as echarts from "echarts";
import { onMount } from "svelte";
import { dbChangeStore } from "../services/sqlService";
import { initDb, runQuery } from "../services/sqlService";
import type { Item } from "../schema/app-schema";

interface ColumnMeta {
    name: string;
}

interface QueryResult {
    rows: Record<string, unknown>[];
    columnsMeta: ColumnMeta[];
}

interface Props {
    item?: Item;
}

let { item }: Props = $props();
let chartDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;
let hasData = $state(false);
let isInitialized = $state(false);

onMount(() => {
    let unsub: (() => void) | undefined;
    initDb().then(() => {
        isInitialized = true;
        chart = echarts.init(chartDiv);
        if (item && item.chartQuery) {
            runItemQuery();
        }
        unsub = dbChangeStore.subscribe(() => {
            if (isInitialized && item && item.chartQuery) {
                runItemQuery();
            }
        });
    }).catch(error => {
        logger.error({ error }, "Error initializing chart");
    });
    return () => {
        if (unsub) unsub();
        chart?.dispose();
    };
});

// Function to run the item's query when needed
async function runItemQuery() {
    if (item && item.chartQuery && isInitialized) {
        try {
            await initDb();
            const result = runQuery(item.chartQuery, true);
            if (result) update(result as QueryResult);
        } catch (error) {
              logger.error({ error }, "Error running item query");
        }
    }
}

// Run the query when the item changes
$effect(() => {
    if (item) {
        runItemQuery();
    }
});

function update(data: QueryResult) {
    if (!chart) return;
    hasData = data.rows.length > 0;
    if (!hasData) {
        chart.clear();
        return;
    }
    const columns = data.columnsMeta.map((c: ColumnMeta) => c.name);

    let xAxisData: string[] = [];
    let seriesData: any[] = [];

    if (data.rows.length > 0) {
        const firstRow = data.rows[0];
        const numericColumns = columns.filter(col => typeof firstRow[col] === "number");
        const labelColumns = columns.filter(col => typeof firstRow[col] !== "number");

        if (labelColumns.length > 0) {
            const labelCol = labelColumns[0];
            xAxisData = data.rows.map(r => String(r[labelCol]));
        } else {
            xAxisData = data.rows.map((_, i) => i.toString());
        }

        seriesData = numericColumns.map(col => ({
            type: "bar",
            name: col,
            data: data.rows.map((r: Record<string, unknown>) => r[col])
        }));
    }

    const option = {
        xAxis: { type: "category", data: xAxisData },
        yAxis: { type: "value" },
        series: seriesData,
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
