<script lang="ts">
import ChartPanel from "./ChartPanel.svelte";

let { option = {
    xAxis: { type: "category", data: ["A", "B", "C"] },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: [1, 2, 3] }],
} }: { option?: any } = $props();
</script>

<ChartPanel {option} />
