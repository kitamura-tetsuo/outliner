<script lang="ts">
    import { queryStore } from '../services/queryStore';
    let query = '';
    function run() {
        queryStore.run(query);
    }
</script>
<div class="query-editor">
    <textarea bind:value={query} data-testid="sql-input"></textarea>
    <button on:click={run} data-testid="run-btn">Run</button>
</div>
