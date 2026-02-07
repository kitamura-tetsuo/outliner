<script lang="ts">
import {
    initDb,
    runQuery,
} from "../services/sqlService";

let sql = $state("SELECT 1 AS value");

async function run() {
    try {
        await initDb();
        runQuery(sql);
    }
    catch (error) {
        console.error("Error running query:", error);
    }
}
</script>

<div class="query-editor">
    <textarea bind:value={sql} rows="4" class="border p-2 w-full" placeholder="Please enter an SQL query"></textarea>
    <button onclick={run} class="mt-2 px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">Run</button>
</div>
