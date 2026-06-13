<script lang="ts">
import * as echarts from "echarts";
import { onMount } from "svelte";
import { queryStore } from "../services/sqlService";
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
    let unsub = () => {};
    let isMounted = true;

    (async () => {
        try {
            await initDb();
            if (!isMounted) return;

            isInitialized = true;

            chart = echarts.init(chartDiv);

            // If an item is provided and has a chartQuery, run it
            if (item && item.chartQuery) {
                runQuery(item.chartQuery);
            }

            unsub = queryStore.subscribe(update);
        } catch (error) {
              console.error("Error initializing chart:", error);
        }
    })();
    return () => {
        isMounted = false;
        unsub();
        chart?.dispose();
    };
});

function update(result: QueryResult | null) {
    if (!result || result.rows.length === 0 || !isInitialized) {
        hasData = false;
        if (chart) {
            chart.clear();
        }
        return;
    }

    const { rows, columnsMeta } = result;

    if (!columnsMeta || columnsMeta.length < 2) {
        hasData = false;
        return;
    }

    const firstColName = columnsMeta[0].name;
    const xAxisData = rows.map((row) => String(row[firstColName]));

    const seriesData = columnsMeta.slice(1).map((col) => {
        return {
            name: col.name,
            type: "bar",
            data: rows.map((row) => Number(row[col.name]) || 0),
        };
    });

    const option = {
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
        },
        legend: {
            data: columnsMeta.slice(1).map((c) => c.name),
        },
        grid: {
            left: "3%",
            right: "4%",
            bottom: "3%",
            containLabel: true,
        },
        xAxis: {
            type: "category",
            data: xAxisData,
        },
        yAxis: {
            type: "value",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series: seriesData as any,
    };

    hasData = true;
    if (chart) {
        chart.setOption(option);
        chart.resize();
    }
}
</script>

<div class="chart-container" class:has-data={hasData}>
    <div bind:this={chartDiv} class="chart-element"></div>
</div>

<style>
    .chart-container {
        width: 100%;
        height: 0; /* Hidden initially */
        overflow: hidden;
        transition: height 0.3s ease;
    }

    .chart-container.has-data {
        height: 300px;
    }

    .chart-element {
        width: 100%;
        height: 100%;
    }
</style>
