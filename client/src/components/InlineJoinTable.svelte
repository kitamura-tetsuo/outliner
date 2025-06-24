<script lang="ts">
import QueryEditor from "./QueryEditor.svelte";
import EditableQueryGrid from "./EditableQueryGrid.svelte";
import ChartPanel from "./ChartPanel.svelte";
</script>

<div class="inline-join-table">
    <QueryEditor />
    <EditableQueryGrid />
    <ChartPanel />
</div>

<style>
.inline-join-table {
    margin-top: 8px;
    border: 1px solid #ddd;
    padding: 8px;
}
</style>
