<script lang="ts">
import * as echarts from 'echarts';
import { onMount } from 'svelte';
import { store } from '../stores/store.svelte';
import { goto } from '$app/navigation';

let graphDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsLink(text: string, target: string): boolean {
    const internal = new RegExp(`\\[${escapeRegExp(target)}\\]`, 'i');
    const project = store.project?.title || '';
    const projectPattern = new RegExp(`\\[\\/${escapeRegExp(project)}\\/${escapeRegExp(target)}\\]`, 'i');
    return internal.test(text) || projectPattern.test(text);
}

function buildGraph() {
    const pages = store.pages?.current || [];
    const nodes = pages.map((p: any) => ({ id: p.id, name: p.text }));
    const links: { source: string; target: string; }[] = [];
    for (const src of pages) {
        const texts = [src.text, ...((src.items as any[]) || []).map(i => i.text)];
        for (const dst of pages) {
            if (src.id === dst.id) continue;
            const target = dst.text.toLowerCase();
            if (texts.some(t => containsLink(t, target))) {
                links.push({ source: src.id, target: dst.id });
            }
        }
    }
    return { nodes, links };
}

function update() {
    if (!chart) return;
    const { nodes, links } = buildGraph();
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
</script>

<div class="graph-view" bind:this={graphDiv} style="width:100%;height:400px;"></div>
