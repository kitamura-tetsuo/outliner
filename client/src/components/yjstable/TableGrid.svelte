<script lang="ts">
// Dynamic grid over the UI Definition query result. Cells render through the
// component mapping (text/number/checkbox/select/date); editable cells write
// into Data Storage (Y.Map) only — PGlite is updated by the sync adapter and
// the grid re-renders from the debounced re-query (one-way data flow).

import {
    analyzeQueryEditability,
    SOURCE_ID_COLUMN,
    SOURCE_KIND_COLUMN,
} from "../../services/yjstable/queryAnalysis";
import { applyUnionedRowEdit, type RelationResolver } from "../../services/yjstable/relationRowWrite";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { moveColumn, orderColumns, writeColumnOrder } from "../../services/yjstable/columnOrder";
import {
    addRecord,
    deleteRecord,
    setRecordValue,
    type TableHandles,
    type TableRecordValue,
} from "../../services/yjstable/tableDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import { cellComponentFor } from "./cellComponents";
import ConfirmDialog from "../ConfirmDialog.svelte";

interface Props {
    handles: TableHandles;
    schema: ParsedTableSchema | undefined;
    query: string;
    result: TableQueryResult;
    /** Component type per column from the UI Definition mirror. */
    componentTypes: Record<string, string | undefined>;
    /** The column order stored in UI Definition. */
    columnOrder: string[];
    /** Whether the table is still loading initial data from the network/storage. */
    loading?: boolean;
    /** Resolves the relation provider a unioned row's `source_kind` names. */
    session: RelationResolver;
}

let { handles, schema, query, result, componentTypes, columnOrder, loading = false, session }: Props = $props();

let rowToDelete: string | null = $state(null);
let isConfirmDialogOpen: boolean = $state(false);

/** Row-identity columns: metadata about the row, never shown as "read-only data". */
const IDENTITY_COLUMNS = new Set(["id", SOURCE_KIND_COLUMN, SOURCE_ID_COLUMN]);

const editability = $derived(analyzeQueryEditability(query, schema, result.columns));
const columnByName = $derived(new Map((schema?.columns ?? []).map((c) => [c.name, c])));
const displayColumns = $derived(orderColumns(result.columns, columnOrder));

let dropTargetColumn = $state<{ column: string; position: "left" | "right" } | undefined>(undefined);

/** This table's own record id, only meaningful when rows are addressed by `id`. */
function recordIdOf(row: Record<string, unknown>): string | undefined {
    if (editability.rowIdentity !== "id") return undefined;
    return typeof row.id === "string" ? row.id : undefined;
}

/** The relation and row a unioned row's edit routes to, when addressed by `source_kind`/`source_id`. */
function sourceOf(row: Record<string, unknown>): { sourceKind: string; sourceId: string; } | undefined {
    if (editability.rowIdentity !== "source") return undefined;
    const sourceKind = row.source_kind;
    const sourceId = row.source_id;
    if (typeof sourceKind !== "string" || typeof sourceId !== "string") return undefined;
    return { sourceKind, sourceId };
}

function rowKey(row: Record<string, unknown>, rowIndex: number): string {
    const recordId = recordIdOf(row);
    if (recordId !== undefined) return recordId;
    const source = sourceOf(row);
    if (source) return `${source.sourceKind}:${source.sourceId}`;
    return `row-${rowIndex}`;
}

function commitCell(row: Record<string, unknown>, column: string, value: TableRecordValue) {
    const recordId = recordIdOf(row);
    if (recordId !== undefined) {
        setRecordValue(handles, recordId, column, value);
        return;
    }
    const source = sourceOf(row);
    if (source) void applyUnionedRowEdit(session, source.sourceKind, source.sourceId, column, value);
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
    rowToDelete = recordId;
    isConfirmDialogOpen = true;
}

function handleConfirmDelete() {
    if (rowToDelete) {
        deleteRecord(handles, rowToDelete);
        rowToDelete = null;
    }
}

function handleCancelDelete() {
    rowToDelete = null;
}
</script>

<div class="yjs-table-grid" data-testid="yjs-table-grid">
    {#if loading}
        <p class="loading-state" data-testid="yjs-table-loading">Loading table...</p>
    {:else if result.columns.length > 0}
        <table>
            <thead>
                <tr>
                    {#each displayColumns as column, index (column)}
                        <th
                            scope="col"
                            draggable="true"
                            tabindex="0"
                            class:drop-target-left={dropTargetColumn?.column === column && dropTargetColumn.position === "left"}
                            class:drop-target-right={dropTargetColumn?.column === column && dropTargetColumn.position === "right"}
                            ondragstart={(e) => {
                                if (e.dataTransfer) {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", column);
                                }
                            }}
                            ondragover={(e) => {
                                e.preventDefault();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const isLeft = e.clientX < rect.left + rect.width / 2;
                                dropTargetColumn = { column, position: isLeft ? "left" : "right" };
                                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                            }}
                            ondragleave={(e) => {
                                const related = e.relatedTarget as Node | null;
                                if (!e.currentTarget?.contains(related)) {
                                    dropTargetColumn = undefined;
                                }
                            }}
                            ondrop={(e) => {
                                e.preventDefault();
                                const draggedCol = e.dataTransfer?.getData("text/plain");
                                if (draggedCol && draggedCol !== column) {
                                    const draggedIndex = displayColumns.indexOf(draggedCol);
                                    if (draggedIndex !== -1) {
                                        // Target index calculation based on drop side and moving direction
                                        let targetIndex = index;
                                        if (draggedIndex < targetIndex && dropTargetColumn?.position === "left") {
                                            targetIndex -= 1;
                                        } else if (draggedIndex > targetIndex && dropTargetColumn?.position === "right") {
                                            targetIndex += 1;
                                        }
                                        writeColumnOrder(handles, moveColumn(displayColumns, draggedCol, targetIndex));
                                    }
                                }
                                dropTargetColumn = undefined;
                            }}
                            onkeydown={(e) => {
                                if (e.altKey) {
                                    if (e.key === "ArrowLeft" && index > 0) {
                                        e.preventDefault();
                                        writeColumnOrder(handles, moveColumn(displayColumns, column, index - 1));
                                    } else if (e.key === "ArrowRight" && index < displayColumns.length - 1) {
                                        e.preventDefault();
                                        writeColumnOrder(handles, moveColumn(displayColumns, column, index + 1));
                                    }
                                }
                            }}
                        >
                            <span class="th-label">
                                {column}
                                {#if editability.editable && !editability.editableColumns.has(column) && !IDENTITY_COLUMNS.has(column)}
                                    <span class="readonly-mark" title="Read-only column">RO</span>
                                {/if}
                            </span>
                        </th>
                    {/each}
                    {#if editability.editable && editability.rowIdentity === "id"}
                        <th scope="col" class="actions-col"><span class="sr-only">Actions</span></th>
                    {/if}
                </tr>
            </thead>
            <tbody>
                {#each result.rows as row, rowIndex (rowKey(row, rowIndex))}
                    {@const recordId = recordIdOf(row)}
                    {@const source = sourceOf(row)}
                    <tr data-record-id={recordId ?? (source ? `${source.sourceKind}:${source.sourceId}` : undefined)}>
                        {#each displayColumns as column (column)}
                            {@const schemaColumn = columnByName.get(column)}
                            {@const CellComponent = cellComponentFor(componentTypes[column], schemaColumn)}
                            <td data-record-id={recordId} data-col={column}>
                                <CellComponent
                                    value={row[column]}
                                    editable={editability.editable
                                    && (recordId !== undefined || source !== undefined)
                                    && editability.editableColumns.has(column)}
                                    options={schemaColumn?.checkOptions}
                                    ariaLabel={`${column} for ${recordId ?? source?.sourceId ?? "new row"}`}
                                    onCommit={(value) => {
                                        if (recordId !== undefined || source !== undefined) commitCell(row, column, value);
                                    }}
                                />
                            </td>
                        {/each}
                        {#if editability.editable && editability.rowIdentity === "id"}
                            <td class="actions-col">
                                {#if recordId !== undefined}
                                    <button
                                        type="button"
                                        class="delete-row"
                                        aria-label={`Delete row ${recordId}`}
                                        onclick={() => deleteRow(recordId)}
                                        title="Delete row"
                                    >🗑️</button>
                                {/if}
                            </td>
                        {/if}
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else if !schema}
        <p class="empty-state">No query result. Apply a schema and set a query to see rows.</p>
    {:else}
        <p class="empty-state">The query returned no rows.</p>
    {/if}

    {#if !editability.editable && editability.readOnlyReason && result.columns.length > 0}
        <p class="readonly-reason" data-testid="grid-readonly-reason">{editability.readOnlyReason}</p>
    {/if}

    {#if schema && editability.editable && editability.rowIdentity === "id"}
        <button type="button" class="add-row" data-testid="yjs-table-add-row" onclick={addRow}>
            + Add row
        </button>
    {/if}

    <ConfirmDialog
        bind:isOpen={isConfirmDialogOpen}
        title="Delete row"
        message={rowToDelete ? `Are you sure you want to delete row ${rowToDelete}?` : "Are you sure you want to delete this row?"}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
    />
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
    cursor: grab;
    user-select: none;
}

th:active {
    cursor: grabbing;
}

th.drop-target-left {
    border-left: 3px solid #2563eb;
}

th.drop-target-right {
    border-right: 3px solid #2563eb;
}

.th-label {
    user-select: none;
    pointer-events: none;
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
    color: #6b7280;
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
.readonly-reason,
.loading-state {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 6px 0;
}
</style>
