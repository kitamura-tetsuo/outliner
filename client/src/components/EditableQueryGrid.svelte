<script lang="ts">
import { mapEdit } from "../services/editMapper";
import {
    applyEdit,
    queryStore,
} from "../services/sqlService";

let data = $state({ rows: [], columnsMeta: [] } as any);

// Svelte 5のリアクティブな購読
$effect(() => {
    const unsubscribe = queryStore.subscribe(v => data = v);
    return unsubscribe;
});

function handleCellEdit(rowIndex: number, columnKey: string, newValue: any) {
    const row = data.rows[rowIndex];
    const info = mapEdit(data.columnsMeta, row, columnKey);
    if (info) {
        row[columnKey] = newValue;
        queryStore.update(q => {
            q.rows[rowIndex][columnKey] = newValue;
            return q;
        });
        applyEdit(info, newValue);
    }
}
</script>

<div class="editable-query-grid">
    {#if data.rows.length > 0}
        <table class="table">
            <thead>
                <tr>
                    {#each data.columnsMeta as column}
                        <th>{column.name}</th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each data.rows as row, rowIndex}
                    <tr>
                        {#each data.columnsMeta as column}
                            <td>
                                <input
                                    type="text"
                                    value={row[column.name] || ""}
                                    onblur={e =>
                                    handleCellEdit(
                                        rowIndex,
                                        column.name,
                                        (e.target as HTMLInputElement)?.value || "",
                                    )}
                                    class="cell-input"
                                />
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else}
        <p>クエリを実行してください</p>
    {/if}
</div>

<style>
.editable-query-grid {
    width: 100%;
    overflow-x: auto;
}

.table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #ddd;
}

.table th,
.table td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

.table th {
    background-color: #f5f5f5;
    font-weight: bold;
}

.cell-input {
    width: 100%;
    border: none;
    background: transparent;
    padding: 4px;
}

.cell-input:focus {
    outline: 2px solid #007bff;
    background-color: #fff;
}
</style>
