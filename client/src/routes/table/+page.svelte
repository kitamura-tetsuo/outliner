<script lang="ts">
    import EditableQueryGrid from "../../components/EditableQueryGrid.svelte";
    import QueryEditor from "../../components/QueryEditor.svelte";
</script>

<div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">SQL Table View</h1>

    <div class="mb-8">
        <h2 class="text-xl mb-2">Query Editor</h2>
        <QueryEditor />
    </div>

    <div>
        <h2 class="text-xl mb-2">Results</h2>
        <EditableQueryGrid />
    </div>
</div>
