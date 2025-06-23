<script lang="ts">
import { queryStore } from "../services/queryStore";
let query = $state("");

function run() {
    queryStore.run(query);
}
</script>
<div class="query-editor">
    <textarea bind:value={query} data-testid="sql-input"></textarea>
    <button onclick={run} data-testid="run-btn">Run</button>
</div>
