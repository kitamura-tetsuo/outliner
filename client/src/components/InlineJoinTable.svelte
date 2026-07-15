<script lang="ts">
import EditableQueryGrid from "./EditableQueryGrid.svelte";
import QueryEditor from "./QueryEditor.svelte";
</script>

<div class="inline-join-table">
    <QueryEditor />
    <EditableQueryGrid />
</div>

<style>
.inline-join-table {
    margin-top: 8px;
    border: 1px solid #ddd;
    padding: 8px;
}
</style>
