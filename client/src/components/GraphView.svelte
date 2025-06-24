<script lang="ts">
import { onMount } from "svelte";
import { goto } from "$app/navigation";
import * as echarts from "echarts";
import { store } from "../stores/store.svelte";

let chartEl: HTMLDivElement;
let chart: echarts.ECharts;

function collectLinks(text: string, fromId: string, links: any[], pages: any[]) {
    if (!text) return;
    const internal = /\[([^\[\]/]+)\]/g;
    const projectName = store.project?.title || "";
    const project = new RegExp(`\\[\\/${projectName}\\/([^\\[\\]]+)\\]`, "g");
    let m: RegExpExecArray | null;
    while ((m = internal.exec(text))) {
        const targetName = m[1].toLowerCase();
        const target = pages.find((p) => p.text.toLowerCase() === targetName);
        if (target) links.push({ source: fromId, target: target.id });
    }
    while ((m = project.exec(text))) {
        const targetName = m[1].toLowerCase();
        const target = pages.find((p) => p.text.toLowerCase() === targetName);
        if (target) links.push({ source: fromId, target: target.id });
    }
}

function buildGraph() {
    const pages = store.pages?.current || [];
    const nodes = pages.map((p) => ({ id: p.id, name: p.text }));
    const links: any[] = [];
    for (const page of pages) {
        collectLinks(page.text, page.id, links, pages);
        const items: any[] = page.items as any;
        if (items) {
            for (const item of items) {
                collectLinks(item.text, page.id, links, pages);
            }
        }
    }
    return { nodes, links };
}

onMount(() => {
    const { nodes, links } = buildGraph();
    chart = echarts.init(chartEl);
    chart.setOption({
        tooltip: {},
        series: [
            {
                type: "graph",
                layout: "force",
                roam: true,
                data: nodes,
                links: links,
                label: { show: true },
            },
        ],
    });
    chart.on("click", (params) => {
        if (params.dataType === "node") {
            const page = store.pages.current.find((p) => p.id === params.data.id);
            if (page) {
                const project = store.project?.title;
                goto(project ? `/${project}/${page.text}` : `/${page.text}`);
            }
        }
    });
    if (typeof window !== "undefined") {
        (window as any).graphChart = chart;
    }
});
</script>

<div bind:this={chartEl} class="graph-container"></div>

<style>
.graph-container {
    width: 100%;
    height: 600px;
}
</style>
