<script lang="ts">
import { runQuery } from '../services/sqlService';
let sql = 'SELECT 1 AS value';
function run() {
    runQuery(sql);
}
</script>

<div class="query-editor">
    <textarea bind:value={sql} rows="4" class="border p-2 w-full"></textarea>
    <button on:click={run} class="mt-2 px-4 py-1 bg-blue-500 text-white rounded">Run</button>
</div>
