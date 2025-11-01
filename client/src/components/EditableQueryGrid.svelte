<script lang="ts">
import { mapEdit } from "../services/editMapper";
import { applyEdit, queryStore } from "../services/sqlService";
import { onDestroy, onMount } from "svelte";

let data = $state({ rows: [], columnsMeta: [] } as any);
let editingCell = $state<{ rowIndex: number; columnKey: string; } | null>(null);
let draggedColumnIndex = $state<number | null>(null);
let draggedRowIndex = $state<number | null>(null);

// Svelte 5 の購読は明示的に onMount/onDestroy で管理
let __unsubscribe: (() => void) | null = null;
onMount(() => {
    try {
        __unsubscribe = queryStore.subscribe(v => { data = v; });
    } catch {}
});
onDestroy(() => { try { __unsubscribe?.(); } catch {} });

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
    editingCell = null;
}

function startEdit(rowIndex: number, columnKey: string) {
    editingCell = { rowIndex, columnKey };
}

function isEditing(rowIndex: number, columnKey: string): boolean {
    return editingCell?.rowIndex === rowIndex && editingCell?.columnKey === columnKey;
}

function addColumn(index: number) {
    const newName = `col${data.columnsMeta.length + 1}`;
    data.columnsMeta.splice(index + 1, 0, { name: newName });
    data.rows.forEach((r: any) => (r[newName] = ""));
    queryStore.update(q => {
        q.columnsMeta = data.columnsMeta;
        q.rows = data.rows;
        return q;
    });
}

function handleColumnDragStart(e: DragEvent, index: number) {
    draggedColumnIndex = index;
    e.dataTransfer?.setData("text/plain", String(index));
}

function handleColumnDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (draggedColumnIndex === null) return;
    const [moved] = data.columnsMeta.splice(draggedColumnIndex, 1);
    data.columnsMeta.splice(index, 0, moved);
    draggedColumnIndex = null;
    queryStore.update(q => {
        q.columnsMeta = data.columnsMeta;
        return q;
    });
}

function handleColumnDragOver(e: DragEvent) {
    e.preventDefault();
}

function handleRowDragStart(e: DragEvent, index: number) {
    draggedRowIndex = index;
    e.dataTransfer?.setData("text/plain", String(index));
}

function handleRowDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (draggedRowIndex === null) return;
    const [row] = data.rows.splice(draggedRowIndex, 1);
    data.rows.splice(index, 0, row);
    draggedRowIndex = null;
    queryStore.update(q => {
        q.rows = data.rows;
        return q;
    });
}

function handleRowDragOver(e: DragEvent) {
    e.preventDefault();
}
</script>

<div class="editable-query-grid">
    {#if data.rows.length > 0}
        <table class="table">
            <thead>
                <tr>
                    {#each data.columnsMeta as column, colIndex (column.name)}
                        <th
                            draggable="true"
                            oncontextmenu={(e) => {
                                e.preventDefault();
                                addColumn(colIndex);
                            }}
                            ondragstart={e => handleColumnDragStart(e, colIndex)}
                            ondragover={handleColumnDragOver}
                            ondrop={e => handleColumnDrop(e, colIndex)}
                        >{column.name}</th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each data.rows as row, rowIndex (rowIndex)}
                    <tr
                        draggable="true"
                        ondragstart={e => handleRowDragStart(e, rowIndex)}
                        ondragover={handleRowDragOver}
                        ondrop={e => handleRowDrop(e, rowIndex)}
                    >
                        {#each data.columnsMeta as column (column.name)}
                            <td ondblclick={() => startEdit(rowIndex, column.name)}>
                                {#if isEditing(rowIndex, column.name)}
                                    <input
                                        type="text"
                                        value={row[column.name] || ""}
                                        onblur={e =>
                                        handleCellEdit(
                                            rowIndex,
                                            column.name,
                                            (e.target as HTMLInputElement)?.value || "",
                                        )}
                                        onkeydown={e => {
                                            if (e.key === "Enter") {
                                                handleCellEdit(
                                                    rowIndex,
                                                    column.name,
                                                    (e.target as HTMLInputElement)?.value || "",
                                                );
                                            }
                                        }}
                                        class="cell-input"
                                    />
                                {:else}
                                    <span class="cell-value">{row[column.name] || ""}</span>
                                {/if}
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
    cursor: move;
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

.cell-value {
    display: block;
    padding: 4px;
    min-height: 1.2em;
    cursor: pointer;
}

.cell-value:hover {
    background-color: #f8f9fa;
}

.table tr[draggable="true"] {
    cursor: move;
}
</style>
