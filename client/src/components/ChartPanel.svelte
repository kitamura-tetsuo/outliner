<script lang="ts">
    import * as echarts from 'echarts';
    import { onMount, onDestroy } from 'svelte';
    const { option } = $props<{ option: any }>();
    let el: HTMLDivElement;
    let chart: echarts.ECharts | undefined;

    onMount(() => {
        chart = echarts.init(el, undefined, { renderer: 'svg' });
        if (option) chart.setOption(option);
    });

    $effect(() => {
        if (chart && option) {
            chart.setOption(option);
        }
    });

    onDestroy(() => {
        chart?.dispose();
    });
</script>
<div bind:this={el} data-testid="chart-panel" style="width:400px;height:300px"></div>
