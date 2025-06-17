<script lang="ts">
import * as d3 from "d3";
import { onMount } from "svelte";

export interface ChartData {
    label: string;
    value: number;
}

interface Props {
    data?: ChartData[];
}

let { data = [] }: Props = $props();
let mounted = false;

onMount(() => {
    mounted = true;
    render();
});

$effect(() => {
    if (mounted) {
        render();
    }
});

function render() {
    const svg = d3.select("#chart-svg");
    svg.selectAll("*").remove();
    const width = 400;
    const height = 200;

    const x = d3.scaleBand()
        .domain(data.map(d => d.label))
        .range([0, width])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 0])
        .range([height, 0]);

    svg.append("g")
        .selectAll("rect")
        .data(data)
        .enter()
        .append("rect")
        .attr("x", d => x(d.label)!)
        .attr("y", d => y(d.value))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.value))
        .attr("fill", "#4caf50");

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));
    svg.append("g")
        .call(d3.axisLeft(y));
}
</script>

<svg id="chart-svg" width="400" height="200"></svg>
