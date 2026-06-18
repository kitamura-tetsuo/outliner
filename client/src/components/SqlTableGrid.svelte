<script lang="ts">
import { onMount, tick } from "svelte";
import type { Item } from "../schema/app-schema";
import { parseCreateTable } from "../services/tableSchema";

interface Props {
    item: Item;
}

let { item }: Props = $props();

// Minimal structural type for the Yjs observe surface we rely on, so this
// component does not need to import the yjs runtime directly.
interface Observable {
    observe(f: () => void): void;
    unobserve(f: () => void): void;
    observeDeep(f: () => void): void;
    unobserveDeep(f: () => void): void;
}

const DEFAULT_DDL =
    "CREATE TABLE tasks (\n  id INTEGER PRIMARY KEY,\n  title TEXT,\n  status TEXT,\n  due TEXT\n)";

// Plain $state mirrors kept in sync with Yjs via observers (mirror pattern).
let schema = $state<string>("");
let columns = $state<string[]>([]);
let rows = $state<Record<string, string>[]>([]);

let definitionMode = $state<boolean>(true);
let draftSql = $state<string>(DEFAULT_DDL);
let errorMessage = $state<string>("");
let editingCell = $state<{ rowIndex: number; column: string; } | null>(null);

function syncFromItem() {
    schema = item.tableSchema ?? "";
    columns = item.tableColumns;
    rows = item.tableRows.toPlain(columns);
}

onMount(() => {
    // Touch tableRows so the backing Y.Array exists before we observe it.
    const rowsArray = item.tableRows.toArray() as unknown as Observable;
    const valueMap = item.tree.getNodeValueFromKey(item.key) as unknown as Observable;

    syncFromItem();
    draftSql = schema || DEFAULT_DDL;
    definitionMode = columns.length === 0;

    const handler = () => syncFromItem();
    valueMap.observe(handler);
    rowsArray.observeDeep(handler);

    return () => {
        try {
            valueMap.unobserve(handler);
        } catch {}
        try {
            rowsArray.unobserveDeep(handler);
        } catch {}
    };
});

async function createTable() {
    errorMessage = "";
    try {
        const parsed = await parseCreateTable(draftSql);
        item.defineTable(draftSql, parsed.columns.map(c => c.name));
        definitionMode = false;
        syncFromItem();
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
    }
}

function editSchema() {
    draftSql = schema || DEFAULT_DDL;
    errorMessage = "";
    definitionMode = true;
}

function addRow() {
    item.tableRows.addRow({});
    syncFromItem();
}

function deleteRow(rowIndex: number) {
    item.tableRows.deleteRow(rowIndex);
    syncFromItem();
}

function startEdit(rowIndex: number, column: string) {
    editingCell = { rowIndex, column };
}

function isEditing(rowIndex: number, column: string): boolean {
    return editingCell?.rowIndex === rowIndex && editingCell?.column === column;
}

async function commitEdit(rowIndex: number, column: string, value: string) {
    item.tableRows.updateCell(rowIndex, column, value);
    editingCell = null;
    syncFromItem();
    await tick();
    const cell = document.querySelector(
        `td[data-row="${rowIndex}"][data-col="${column.replace(/"/g, "\\\"")}"]`,
    ) as HTMLElement | null;
    cell?.focus();
}
</script>

<div class="sql-table-grid" data-testid="sql-table-grid">
    {#if definitionMode}
        <div class="definition">
            <label class="definition-label" for="sql-table-ddl">Define table with SQL</label>
            <textarea
                id="sql-table-ddl"
                bind:value={draftSql}
                rows="6"
                class="ddl-input"
                placeholder="CREATE TABLE ..."
                aria-label="CREATE TABLE statement"
            ></textarea>
            {#if errorMessage}
                <p class="error" role="alert">{errorMessage}</p>
            {/if}
            <div class="definition-actions">
                <button class="primary" onclick={createTable} aria-label="Create table from SQL">
                    Create table
                </button>
                {#if columns.length > 0}
                    <button onclick={() => (definitionMode = false)} aria-label="Cancel schema edit">
                        Cancel
                    </button>
                {/if}
            </div>
        </div>
    {:else}
        <div class="grid-toolbar">
            <button onclick={addRow} aria-label="Add row">+ Row</button>
            <button onclick={editSchema} aria-label="Edit table schema">Edit schema</button>
        </div>
        <table class="grid">
            <thead>
                <tr>
                    {#each columns as column (column)}
                        <th>{column}</th>
                    {/each}
                    <th class="actions-col" aria-label="Row actions"></th>
                </tr>
            </thead>
            <tbody>
                {#if rows.length === 0}
                    <tr>
                        <td class="empty" colspan={columns.length + 1}>No rows yet. Click “+ Row”.</td>
                    </tr>
                {:else}
                    {#each rows as row, rowIndex (rowIndex)}
                        <tr>
                            {#each columns as column (column)}
                                <td
                                    data-row={rowIndex}
                                    data-col={column}
                                    tabindex="0"
                                    role="gridcell"
                                    title="Double click or Enter to edit"
                                    ondblclick={() => startEdit(rowIndex, column)}
                                    onkeydown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            startEdit(rowIndex, column);
                                        }
                                    }}
                                >
                                    {#if isEditing(rowIndex, column)}
                                        <!-- svelte-ignore a11y_autofocus -->
                                        <input
                                            type="text"
                                            value={row[column] ?? ""}
                                            class="cell-input"
                                            onblur={e =>
                                            commitEdit(rowIndex, column, (e.target as HTMLInputElement).value)}
                                            onkeydown={(e) => {
                                                if (e.key === "Enter") {
                                                    commitEdit(rowIndex, column, (e.target as HTMLInputElement).value);
                                                } else if (e.key === "Escape") {
                                                    editingCell = null;
                                                }
                                            }}
                                            autofocus
                                        />
                                    {:else}
                                        <span class="cell-value">{row[column] ?? ""}</span>
                                    {/if}
                                </td>
                            {/each}
                            <td class="actions-col">
                                <button
                                    class="delete-row"
                                    onclick={() => deleteRow(rowIndex)}
                                    aria-label={`Delete row ${rowIndex + 1}`}
                                    title="Delete row"
                                >×</button>
                            </td>
                        </tr>
                    {/each}
                {/if}
            </tbody>
        </table>
    {/if}
</div>

<style>
.sql-table-grid {
    margin-top: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    width: 100%;
    overflow-x: auto;
}

.definition-label {
    display: block;
    font-weight: bold;
    margin-bottom: 4px;
}

.ddl-input {
    width: 100%;
    font-family: var(--mono-font, monospace);
    padding: 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
}

.definition-actions,
.grid-toolbar {
    display: flex;
    gap: 8px;
    margin: 8px 0;
}

.error {
    color: #c00;
    margin: 6px 0;
}

button.primary {
    background-color: #007bff;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    cursor: pointer;
}

.grid {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #ddd;
}

.grid th,
.grid td {
    border: 1px solid #ddd;
    padding: 6px 8px;
    text-align: left;
}

.grid th {
    background-color: #f5f5f5;
    font-weight: bold;
}

.grid td:focus {
    outline: 2px solid #007bff;
    outline-offset: -2px;
}

.cell-input {
    width: 100%;
    border: none;
    background: transparent;
    padding: 2px;
    box-sizing: border-box;
}

.cell-input:focus {
    outline: 2px solid #007bff;
    background-color: #fff;
}

.cell-value {
    display: block;
    min-height: 1.2em;
    cursor: pointer;
}

.empty {
    color: #888;
    text-align: center;
    font-style: italic;
}

.actions-col {
    width: 32px;
    text-align: center;
}

.delete-row {
    background: transparent;
    border: none;
    color: #c00;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
}
</style>
