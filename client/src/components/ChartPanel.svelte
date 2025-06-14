<script lang="ts">
import * as echarts from 'echarts';
import { onMount } from 'svelte';

export let option: any;
let chartEl: HTMLDivElement;
let chart: echarts.ECharts;

onMount(() => {
    chart = echarts.init(chartEl);
    if (option) chart.setOption(option, { notMerge: true });
});

$: if (chart && option) {
    chart.setOption(option, { notMerge: true });
}
</script>

<div bind:this={chartEl} class="w-full h-64"></div>
