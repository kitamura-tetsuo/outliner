<script lang="ts">
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import * as d3 from 'd3';
import { store } from '../stores/store.svelte';

interface NodeData {
    id: string;
    title: string;
}
interface LinkData {
    source: string;
    target: string;
}

let nodes: NodeData[] = [];
let links: LinkData[] = [];

function buildGraphData() {
    const pages = store.pages.current ?? [];
    nodes = pages.map(p => ({ id: p.id, title: p.text }));
    links = [];
    const internalLinkRegex = /\[([^\[\]\/\-][^\[\]]*?)\]/g;
    for (const page of pages) {
        let match;
        while ((match = internalLinkRegex.exec(page.text))) {
            const targetTitle = match[1];
            const target = pages.find(p => p.text === targetTitle);
            if (target) {
                links.push({ source: page.id, target: target.id });
            }
        }
    }
}

function renderGraph() {
    const svg = d3.select('#graph-svg');
    svg.selectAll('*').remove();
    const width = 600;
    const height = 400;

    const simulation = d3.forceSimulation<NodeData>(nodes)
        .force('link', d3.forceLink<NodeData, d3.SimulationLinkDatum<NodeData>>(links).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2));

    const link = svg.append('g')
        .selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('stroke', '#999');

    const node = svg.append('g')
        .selectAll('circle')
        .data(nodes)
        .enter()
        .append('circle')
        .attr('r', 10)
        .attr('fill', '#69b')
        .on('click', (_, d) => {
            const page = store.pages.current.find(p => p.id === d.id);
            if (page) {
                const project = store.project?.title ?? '';
                goto(`/${project}/${page.text}`);
            }
        })
        .call(d3.drag<SVGCircleElement, NodeData>()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    const label = svg.append('g')
        .selectAll('text')
        .data(nodes)
        .enter()
        .append('text')
        .text(d => d.title)
        .attr('dx', 12)
        .attr('dy', '.35em');

    simulation.on('tick', () => {
        link
            .attr('x1', d => (d.source as NodeData).x!)
            .attr('y1', d => (d.source as NodeData).y!)
            .attr('x2', d => (d.target as NodeData).x!)
            .attr('y2', d => (d.target as NodeData).y!);

        node
            .attr('cx', d => d.x!)
            .attr('cy', d => d.y!);

        label
            .attr('x', d => d.x!)
            .attr('y', d => d.y!);
    });

    function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }
    function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }
    function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }
}

function updateGraph() {
    buildGraphData();
    renderGraph();
}

onMount(() => {
    updateGraph();
    const interval = setInterval(updateGraph, 5000);
    return () => clearInterval(interval);
});
</script>

<svg id="graph-svg" width="600" height="400"></svg>

<style>
#graph-svg {
    border: 1px solid #ccc;
}
</style>
