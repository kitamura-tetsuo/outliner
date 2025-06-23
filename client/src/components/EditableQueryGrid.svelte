<script lang="ts">
const {
    columns = [],
    rows = [],
    readonlyColumns = [],
    onedit,
} = $props<{
    columns?: string[];
    rows?: any[][];
    readonlyColumns?: string[];
    onedit?: (event: CustomEvent<{ rowIndex: number; colIndex: number; value: string; }>) => void;
}>();

function updateCell(rowIndex: number, colIndex: number, value: string) {
    onedit?.(new CustomEvent("edit", { detail: { rowIndex, colIndex, value } }));
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
                            <input
                                value={cell}
                                data-row={rowIndex}
                                data-col={colIndex}
                                onchange={e => updateCell(rowIndex, colIndex, (e.target as HTMLInputElement).value)}
                            >
                        {/if}
                    </td>
                {/each}
            </tr>
        {/each}
    </tbody>
</table>
