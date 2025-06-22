<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    const { columns = [], rows = [], readonlyColumns = [] } = $props<{
        columns?: string[];
        rows?: any[][];
        readonlyColumns?: string[];
    }>();
    const dispatch = createEventDispatcher();

    function updateCell(rowIndex: number, colIndex: number, value: string) {
        dispatch('edit', { rowIndex, colIndex, value });
    }
</script>

<table data-testid="query-grid">
    <thead>
        <tr>{#each columns as col}<th>{col}</th>{/each}</tr>
    </thead>
    <tbody>
        {#each rows as row, rowIndex}
        <tr>
            {#each row as cell, colIndex}
            <td>
                {#if readonlyColumns.includes(columns[colIndex])}
                    <span>{cell}</span>
                {:else}
                    <input value={cell}
                        data-row={rowIndex}
                        data-col={colIndex}
                        onchange={(e) => updateCell(rowIndex, colIndex, (e.target as HTMLInputElement).value)}>
                {/if}
            </td>
            {/each}
        </tr>
        {/each}
    </tbody>
</table>
