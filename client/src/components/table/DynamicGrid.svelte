<script lang="ts">
import type * as Y from "yjs";
import type { QueryResult } from "../../services/pgliteService";
import type { IntrospectedColumn } from "../../services/schemaParser";

interface Props {
    data: QueryResult | null;
    uiMap: Y.Map<unknown>;
    dataMap: Y.Map<Y.Map<string>>;
    schemaColumns: IntrospectedColumn[];
}

let { data, uiMap, dataMap, schemaColumns }: Props = $props();

let componentsConfig = $state<Record<string, unknown>>(uiMap.get("components") as Record<string, unknown> || {});
let editingCell = $state<{ recordId: string; colName: string; } | null>(null);

// Determine if grid is editable based on query and results
let isEditable = $derived((): boolean => {
    if (!data || data.rows.length === 0) return false;
    const hasId = data.columnsMeta.some(c => c.name === "id");
    // Simplified join/agg check
    const query = (uiMap.get("query") as string || "").toUpperCase();
    const isComplex = query.includes(" JOIN ") || query.includes(" GROUP BY ");
    return hasId && !isComplex;
});

function handleCellEdit(recordId: string, colName: string, newValue: string) {
    if (!isEditable) return;

    // Check if record exists, if not, it should be an insert which implies row addition logic,
    // For now assume update only on existing rows that have an id.
    const recordMap = dataMap.get(recordId);
    if (recordMap) {
        recordMap.set(colName, newValue);
    }
    editingCell = null;
}

function startEdit(recordId: string, colName: string) {
    if (!isEditable) return;
    editingCell = { recordId, colName };
}

function getOptionsForColumn(colName: string): string[] {
    const colDef = schemaColumns.find(c => c.name === colName);
    if (!colDef) return [];

    for (const c of colDef.constraints) {
        if (c.type === "CHECK" && c.options && c.options.length > 0) {
            return c.options;
        }
    }
    return [];
}
</script>

<div class="dynamic-grid-container">
    {#if !data || data.rows.length === 0}
        <p class="empty-state">No data to display. Check your query or schema.</p>
    {:else}
        <table class="dynamic-table">
            <thead>
                <tr>
                    {#each data.columnsMeta as col (col.name)}
                        <th>{col.name}</th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each data.rows as row (row.id ? String(row.id) : JSON.stringify(row))}
                    {@const recordId = String(row.id || "")}
                    <tr>
                        {#each data.columnsMeta as col (col.name)}
                            {@const cellValue = String(row[col.name] ?? "")}
                            {@const compType = (componentsConfig[col.name] as { type?: string } | undefined)?.type || "text"}
                            {@const isEditing = editingCell?.recordId === recordId && editingCell?.colName === col.name}

                            <td
                                class:editable={Boolean(isEditable) && col.name !== "id"}
                                ondblclick={() => startEdit(recordId, col.name)}
                            >
                                {#if isEditing && Boolean(isEditable) && col.name !== "id"}
                                    {#if compType === "select"}
                                        <select
                                            value={cellValue}
                                            onchange={e => handleCellEdit(recordId, col.name, (e.target as HTMLSelectElement).value)}
                                            onblur={() => editingCell = null}
                                            autofocus
                                        >
                                            {#each getOptionsForColumn(col.name) as opt (opt)}
                                                <option value={opt}>{opt}</option>
                                            {/each}
                                        </select>
                                    {:else}
                                        <input
                                            type="text"
                                            value={cellValue}
                                            onblur={e => handleCellEdit(recordId, col.name, (e.target as HTMLInputElement).value)}
                                            onkeydown={e => {
                                                if (e.key === "Enter") handleCellEdit(recordId, col.name, (e.target as HTMLInputElement).value);
                                            }}
                                            autofocus
                                        />
                                    {/if}
                                {:else}
                                    <span class="cell-display">{cellValue}</span>
                                {/if}
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}
</div>

<style>
.dynamic-grid-container {
    overflow-x: auto;
    width: 100%;
}
.dynamic-table {
    width: 100%;
    border-collapse: collapse;
}
.dynamic-table th, .dynamic-table td {
    border: 1px solid #ddd;
    padding: 6px 8px;
    text-align: left;
}
.dynamic-table th {
    background: #f5f5f5;
}
.dynamic-table td.editable {
    cursor: cell;
}
.dynamic-table td.editable:hover {
    background: #fafafa;
}
input, select {
    width: 100%;
    box-sizing: border-box;
    padding: 4px;
}
.cell-display {
    display: inline-block;
    min-height: 1.2em;
    width: 100%;
}
.empty-state {
    color: #666;
    font-style: italic;
    padding: 12px;
}
</style>
