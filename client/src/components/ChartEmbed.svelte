<script lang="ts">
import ChartPanel from "./ChartPanel.svelte";

export let option: any = {
    xAxis: { type: "category", data: ["A", "B", "C"] },
    yAxis: { type: "value" },
    series: [{ type: "bar", data: [1, 2, 3] }],
};
</script>

<ChartPanel {option} />
