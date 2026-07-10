<script lang="ts">
import { onMount, tick } from "svelte";
import type { Item } from "../schema/app-schema";
import { isYjsObservable, isYjsObservableDeep } from "../utils/typeGuards";
import { parseCreateTable } from "../services/tableSchema";
import TableDefinitionEditor from "./TableDefinitionEditor.svelte";

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
    const rowsArray = item.tableRows.toArray();
    const valueMap = item.tree.getNodeValueFromKey(item.key);

    // Note: event handlers are attached in the cleanup return block below

    syncFromItem();
    draftSql = schema || DEFAULT_DDL;
    definitionMode = columns.length === 0;

    const handler = () => syncFromItem();
    if (isYjsObservable(valueMap)) {
        valueMap.observe(handler);
    }
    // Note: item.tableRows.toArray() returns a plain array, so it is not observable.
    // We should observe item.tableRows instead to get deep reactivity.
    if (isYjsObservableDeep(item.tableRows)) {
        item.tableRows.observeDeep(handler);
    }

    return () => {
        try {
            if (isYjsObservable(valueMap)) {
                valueMap.unobserve(handler);
            }
        } catch {}
        try {
            if (isYjsObservableDeep(item.tableRows)) {
                item.tableRows.unobserveDeep(handler);
            }
        } catch {}
    };
});

async function createTable(sql: string) {
    errorMessage = "";
    try {
        const parsed = await parseCreateTable(sql);
        item.defineTable(sql, parsed.columns.map(c => c.name));
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

function downloadCSV() {
    if (columns.length === 0) return;

    // Create CSV content
    const header = columns.join(",");
    const csvRows = rows.map(row => {
        return columns.map(col => {
            const val = row[col] ?? "";
            // Escape quotes and wrap in quotes if contains comma or newline
            if (val.includes(",") || val.includes("\"") || val.includes("\n")) {
                return `"${val.replace(/"/g, "\"\"")}"`;
            }
            return val;
        }).join(",");
    });

    const csvContent = [header, ...csvRows].join("\n");

    // Trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const match = schema.match(/CREATE TABLE\s+([a-zA-Z0-9_]+)/i);
    const tableName = match ? match[1] : "export";
    link.setAttribute("download", `${tableName}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importCSV() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (!text) return;

            try {
                // Simple CSV parser
                const lines = [];
                let currentLine = [];
                let currentField = "";
                let inQuotes = false;

                for (let i = 0; i < text.length; i++) {
                    const char = text[i];

                    if (char === "\"" && text[i + 1] === "\"") {
                        currentField += "\"";
                        i++; // skip next quote
                    } else if (char === "\"") {
                        inQuotes = !inQuotes;
                    } else if (char === "," && !inQuotes) {
                        currentLine.push(currentField);
                        currentField = "";
                    } else if (char === "\n" && !inQuotes) {
                        currentLine.push(currentField);
                        lines.push(currentLine);
                        currentLine = [];
                        currentField = "";
                    } else if (char === "\r" && !inQuotes) {
                        // ignore carriage return
                    } else {
                        currentField += char;
                    }
                }

                if (currentField !== "" || currentLine.length > 0) {
                    currentLine.push(currentField);
                    lines.push(currentLine);
                }

                if (lines.length > 0) {
                    // Start from line 1 to skip header (assuming header matches our columns)
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i];
                        if (line.length === 1 && line[0] === "") continue; // skip empty lines

                        const rowData: Record<string, string> = {};
                        columns.forEach((col, idx) => {
                            if (idx < line.length) {
                                rowData[col] = line[idx];
                            }
                        });
                        item.tableRows.addRow(rowData);
                    }
                    syncFromItem();
                }
            } catch (_err) {
                errorMessage = "Failed to parse CSV";
            }
        };
        reader.readAsText(file);
    };
    input.click();
}
</script>

<div class="sql-table-grid" data-testid="sql-table-grid">
    {#if definitionMode}
        <TableDefinitionEditor
            bind:draftSql
            errorMessage={errorMessage}
            columnsLength={columns.length}
            onsave={createTable}
            oncancel={() => (definitionMode = false)}
        />
    {:else}
        <div class="grid-toolbar">
            <button type="button" onclick={addRow} aria-label="Add row">+ Row</button>
            <button type="button" onclick={editSchema} aria-label="Edit table schema">Edit schema</button>
            <button type="button" onclick={downloadCSV} aria-label="Export to CSV">Export CSV</button>
            <button type="button" onclick={importCSV} aria-label="Import from CSV">Import CSV</button>
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
                                <button type="button"
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

.grid-toolbar {
    display: flex;
    gap: 8px;
    margin: 8px 0;
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

button {
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.25rem 0.75rem;
    font-size: 0.875rem;
    color: #374151;
    cursor: pointer;
}
button:hover {
    background-color: #e5e7eb;
}
</style>
