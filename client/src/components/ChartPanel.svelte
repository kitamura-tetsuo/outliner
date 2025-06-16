<script lang="ts">
import { onMount } from 'svelte';
import { browser } from '$app/environment';

type Props = { option?: any };
let { option = undefined }: Props = $props();
let chartEl: HTMLDivElement;
let chart: any;

onMount(async () => {
    if (!browser) return;
    const echarts = await import('echarts');
    chart = echarts.init(chartEl);
    if (option) chart.setOption(option, { notMerge: true });
});

$effect(() => {
    if (browser && chart && option) {
        chart.setOption(option, { notMerge: true });
    }
});
</script>

<div bind:this={chartEl} class="w-full h-64"></div>
