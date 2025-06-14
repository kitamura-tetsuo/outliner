<script lang="ts">
import GraphView from '../../components/GraphView.svelte';
import ChartComponent from '../../components/ChartComponent.svelte';
import { onMount } from 'svelte';
import { store } from '../../stores/store.svelte';
export const ssr = false;
let chartData = $state<{label:string,value:number}[]>([]);

onMount(() => {
    const pages = store.pages.current ?? [];
    chartData = pages.map(p => ({ label: p.text, value: p.items.length }));
});
</script>

<h1>Graph View</h1>
<GraphView />
<h2>Page Item Count</h2>
<ChartComponent data={chartData} />
