<script lang="ts">
import { onMount } from "svelte";
import type { QueryResult } from "../services/sqlService";
import { queryStore } from "../services/sqlService";

let data = $state<QueryResult>({ rows: [], columnsMeta: [] });

// queryStoreの変更を監視
onMount(() => {
    const unsubscribe = queryStore.subscribe(value => {
        data = value;
    });

    return unsubscribe;
});
</script>

<div class="editable-query-grid">
    {#if data.rows.length > 0}
        <table class="w-full border-collapse border border-gray-300">
            <thead>
                <tr class="bg-gray-100">
                    {#each data.columnsMeta as column}
                        <th class="border border-gray-300 px-4 py-2 text-left">{column.name}</th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each data.rows as row}
                    <tr>
                        {#each data.columnsMeta as column}
                            <td class="border border-gray-300 px-4 py-2">{row[column.name] || ""}</td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else}
        <div class="text-gray-500 text-center py-8">
            クエリを実行してください
        </div>
    {/if}
</div>
