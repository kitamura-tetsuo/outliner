<script lang="ts">
import { browser } from "$app/environment";
import { onMount } from "svelte";

type Props = { option?: any; };
let { option = undefined }: Props = $props();
let chartEl: HTMLDivElement;
let chart: any;

onMount(async () => {
    if (!browser) return;
    const echarts = await import("echarts");
    chart = echarts.init(chartEl);

    // テスト用にEChartsインスタンスをDOM要素に保存
    if (chartEl) {
        (chartEl as any)._echarts_instance_ = chart;
    }

    if (option) chart.setOption(option, { notMerge: true });
});

$effect(() => {
    if (browser && chart && option) {
        chart.setOption(option, { notMerge: true });

        // テスト用にEChartsインスタンスを再度保存
        if (chartEl) {
            (chartEl as any)._echarts_instance_ = chart;
        }
    }
});
</script>

<div bind:this={chartEl} class="w-full h-64" data-testid="chart-panel"></div>
