<script lang="ts">
import * as echarts from 'echarts';
import { onMount } from 'svelte';
import { store } from '../stores/store.svelte';
import { goto } from '$app/navigation';
import { buildGraph } from '../utils/graphUtils';

let graphDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;



function update() {
    if (!chart) return;
    const pages = store.pages?.current || [];
    const project = store.project?.title || '';
    const { nodes, links } = buildGraph(pages, project);
    chart.setOption({
        tooltip: {},
        series: [{
            type: 'graph',
            layout: 'force',
            roam: true,
            data: nodes,
            links,
            label: { position: 'right' }
        }]
    });
}

onMount(() => {
    chart = echarts.init(graphDiv);
    (window as any).__GRAPH_CHART__ = chart;
    chart.on('click', (params: any) => {
        if (params.dataType === 'node') {
            const pageName = params.data.name;
            const projectName = store.project?.title;
            if (projectName) {
                goto(`/${projectName}/${pageName}`);
            } else {
                goto(`/${pageName}`);
            }
        }
    });
    update();
    return () => { chart?.dispose(); };
});

$effect(() => {
    // Trigger update when project or pages change
    store.project;
    store.pages?.current;
    update();
});
</script>

<div class="graph-view" bind:this={graphDiv} style="width:100%;height:400px;"></div>
