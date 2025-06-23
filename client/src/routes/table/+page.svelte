<script lang="ts">
import { onMount } from "svelte";
import EditableQueryGrid from "../../components/EditableQueryGrid.svelte";
import QueryEditor from "../../components/QueryEditor.svelte";
import { initDb } from "../../services/sqlService";

onMount(async () => {
    await initDb();
});
</script>

<svelte:head>
    <title>テーブル | Fluid Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold mb-6">Editable JOIN Table</h1>

    <div class="space-y-6">
        <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold mb-4">SQLクエリエディタ</h2>
            <QueryEditor />
        </div>

        <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold mb-4">クエリ結果</h2>
            <EditableQueryGrid />
        </div>
    </div>
</main>

<style>
.container {
    max-width: 1200px;
}
</style>
