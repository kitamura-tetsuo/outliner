<script lang="ts">
// Dynamic grid over the UI Definition query result. Cells render through the
// component mapping (text/number/checkbox/select/date); editable cells write
// into Data Storage (Y.Map) only — PGlite is updated by the sync adapter and
// the grid re-renders from the debounced re-query (one-way data flow).

import { analyzeQueryEditability } from "../../services/yjstable/queryAnalysis";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import {
    addRecord,
    deleteRecord,
    setRecordValue,
    type TableHandles,
    type TableRecordValue,
} from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import { cellComponentFor } from "./cellComponents";

interface Props {
    handles: TableHandles;
    schema: ParsedTableSchema | undefined;
    query: string;
    result: TableQueryResult;
    /** Component type per column from the UI Definition mirror. */
    componentTypes: Record<string, string | undefined>;
}

let { handles, schema, query, result, componentTypes }: Props = $props();

const editability = $derived(analyzeQueryEditability(query, schema, result.columns));
const columnByName = $derived(new Map((schema?.columns ?? []).map((c) => [c.name, c])));

function commitCell(recordId: string, column: string, value: TableRecordValue) {
    setRecordValue(handles, recordId, column, value);
}

function newRecordDefaults(): Record<string, TableRecordValue> {
    const defaults: Record<string, TableRecordValue> = {};
    for (const column of schema?.columns ?? []) {
        if (column.name === "id") continue;
        if (column.checkOptions && column.checkOptions.length > 0) {
            defaults[column.name] = column.checkOptions[0];
        } else if (!column.isNullable && column.kind === "text") {
            defaults[column.name] = "";
        } else if (!column.isNullable && column.kind === "boolean") {
            defaults[column.name] = false;
        }
    }
    return defaults;
}

function addRow() {
    addRecord(handles, newRecordDefaults());
}

function deleteRow(recordId: string) {
    deleteRecord(handles, recordId);
}
</script>

<div class="yjs-table-grid" data-testid="yjs-table-grid">
    {#if result.columns.length > 0}
        <table>
            <thead>
                <tr>
                    {#each result.columns as column (column)}
                        <th>
                            {column}
                            {#if editability.editable && !editability.editableColumns.has(column) && column !== "id"}
                                <span class="readonly-mark" title="Read-only column">RO</span>
                            {/if}
                        </th>
                    {/each}
                    {#if editability.editable}
                        <th class="actions-col"></th>
                    {/if}
                </tr>
            </thead>
            <tbody>
                {#each result.rows as row, rowIndex (typeof row.id === "string" ? row.id : `row-${rowIndex}`)}
                    {@const recordId = typeof row.id === "string" ? row.id : undefined}
                    <tr data-record-id={recordId}>
                        {#each result.columns as column (column)}
                            {@const schemaColumn = columnByName.get(column)}
                            {@const CellComponent = cellComponentFor(componentTypes[column], schemaColumn)}
                            <td data-record-id={recordId} data-col={column}>
                                <CellComponent
                                    value={row[column]}
                                    editable={editability.editable
                                    && recordId !== undefined
                                    && editability.editableColumns.has(column)}
                                    options={schemaColumn?.checkOptions}
                                    onCommit={(value) => {
                                        if (recordId !== undefined) commitCell(recordId, column, value);
                                    }}
                                />
                            </td>
                        {/each}
                        {#if editability.editable}
                            <td class="actions-col">
                                {#if recordId !== undefined}
                                    <button
                                        type="button"
                                        class="delete-row"
                                        aria-label="Delete row"
                                        onclick={() => deleteRow(recordId)}
                                    >x</button>
                                {/if}
                            </td>
                        {/if}
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else}
        <p class="empty-state">No query result. Apply a schema and set a query to see rows.</p>
    {/if}

    {#if !editability.editable && editability.readOnlyReason && result.columns.length > 0}
        <p class="readonly-reason" data-testid="grid-readonly-reason">{editability.readOnlyReason}</p>
    {/if}

    {#if schema && editability.editable}
        <button type="button" class="add-row" data-testid="yjs-table-add-row" onclick={addRow}>
            + Add row
        </button>
    {/if}
</div>

<style>
.yjs-table-grid {
    width: 100%;
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #d1d5db;
}

th,
td {
    border: 1px solid #d1d5db;
    padding: 2px 4px;
    text-align: left;
    font-size: 0.875rem;
}

th {
    background-color: #f3f4f6;
    font-weight: 600;
}

.readonly-mark {
    margin-left: 4px;
    font-size: 0.65rem;
    color: #6b7280;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    padding: 0 2px;
}

.actions-col {
    width: 2rem;
    text-align: center;
}

.delete-row {
    border: none;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
    padding: 0 4px;
}

.delete-row:hover {
    color: #dc2626;
}

.add-row {
    margin-top: 6px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #f9fafb;
    padding: 2px 10px;
    cursor: pointer;
    font-size: 0.875rem;
}

.add-row:hover {
    background: #f3f4f6;
}

.empty-state,
.readonly-reason {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 6px 0;
}
</style>
