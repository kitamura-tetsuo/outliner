<script lang="ts">
import { onMount } from "svelte";
import { initDb, runQuery } from "../services/sqlService";
import type { Item } from "../schema/app-schema";

interface Props {
    item: Item;
}

let { item }: Props = $props();
let sql = $state(item.chartQuery || "SELECT 1 AS value");
let isInitialized = $state(false);

onMount(async () => {
    try {
        await initDb();
        isInitialized = true;
        // If there's already a query, run it
        if (item.chartQuery) {
            runQuery(item.chartQuery);
        }
    } catch (error) {
        console.error("Error initializing database:", error);
    }
});

async function run() {
    try {
        // Update the item's chartQuery field
        item.chartQuery = sql;
        
        // Run the query
        await initDb();
        runQuery(sql);
    } catch (error) {
        console.error("Error running query:", error);
    }
}

function handleSqlChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    sql = target.value;
}
</script>

<div class="chart-query-editor">
    <textarea
        bind:value={sql}
        rows="4"
        class="border p-2 w-full"
        placeholder="Please enter SQL query"
        oninput={handleSqlChange}
    ></textarea>
    <button 
        onclick={run} 
        class="mt-2 px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        disabled={!isInitialized}
    >
        Run
    </button>
</div>

<style>
.chart-query-editor {
    margin-top: 8px;
    border: 1px solid #ddd;
    padding: 8px;
}
</style>