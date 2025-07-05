<script lang="ts">
import * as echarts from "echarts";
import { onMount } from "svelte";
import { queryStore } from "../services/sqlService";

let chartDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;
let hasData = false;

onMount(() => {
    chart = echarts.init(chartDiv);
    const unsub = queryStore.subscribe(update);
    return () => {
        unsub();
        chart?.dispose();
    };
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
        series: columns.map(col => ({ type: "bar", data: data.rows.map((r: any) => r[col]) })),
    };
    chart.setOption(option, { notMerge: true });
}
</script>

<div class="chart-panel" bind:this={chartDiv} style="width: 100%; height: 300px; position: relative">
    {#if !hasData}
        <p class="no-data" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)">No data</p>
    {/if}
</div>
