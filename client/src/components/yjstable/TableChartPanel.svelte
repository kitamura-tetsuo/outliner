<script lang="ts">
// Chart view over the current query result (ECharts). The parent view pushes
// new results imperatively via the exported update() function — driven by the
// sync adapter's query callback, not by an $effect.

import * as echarts from "echarts";
import { onDestroy, onMount } from "svelte";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";

interface Props {
    initial?: TableQueryResult;
}

let { initial }: Props = $props();

let chartDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;
let hasData = $state(false);
let ariaLabel = $state("");

export function update(result: TableQueryResult) {
    if (!chart) return;
    hasData = result.rows.length > 0;
    if (!hasData) {
        chart.clear();
        return;
    }
    const firstRow = result.rows[0];
    let labelColumn: string | undefined;
    const numericColumns: string[] = [];
    for (const column of result.columns) {
        if (typeof firstRow[column] === "number") {
            numericColumns.push(column);
        } else if (!labelColumn) {
            labelColumn = column;
        }
    }

    ariaLabel = `Bar chart of ${numericColumns.join(", ")} by ${labelColumn || "index"}: ${result.rows.map((r, i) => `${labelColumn ? r[labelColumn] : i} (${numericColumns.map((c) => r[c]).join(", ")})`).join(", ")}`;

    chart.setOption({
        aria: {
            enabled: true,
            decal: {
                show: true,
            },
        },
        xAxis: {
            type: "category",
            data: labelColumn
                ? result.rows.map((r) => String(r[labelColumn]))
                : result.rows.map((_r, i) => String(i)),
        },
        yAxis: { type: "value" },
        series: numericColumns.map((column) => ({
            name: column,
            type: "bar",
            data: result.rows.map((r) => r[column]),
        })),
    }, { notMerge: true });
}

onMount(() => {
    chart = echarts.init(chartDiv);
    if (initial) update(initial);
});

onDestroy(() => {
    chart?.dispose();
    chart = undefined;
});
</script>

<div
    class="table-chart-panel"
    data-testid="yjs-table-chart"
    bind:this={chartDiv}
    role="img"
    aria-label={ariaLabel}
>
    {#if !hasData}
        <p class="no-data">No data</p>
    {/if}
</div>

<style>
.table-chart-panel {
    width: 100%;
    height: 300px;
    position: relative;
}

.no-data {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #6b7280;
}
</style>
