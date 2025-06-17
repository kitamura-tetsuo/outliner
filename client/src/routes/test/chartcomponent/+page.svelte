<script lang="ts">
    import ChartComponent from '../../../components/ChartComponent.svelte';

    const sampleData = [
        { label: 'Apple', value: 100 },
        { label: 'Banana', value: 200 },
        { label: 'Cherry', value: 150 }
    ];
</script>

<h1>ChartComponent Test Page</h1>

<div style="width: 500px; height: 300px;">
    <ChartComponent data={sampleData} />
</div>
