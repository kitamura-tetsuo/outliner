<script lang="ts">
// Structured (form) editor for the Grid Definition. There is no YAML or other
// text representation: every form input writes only its own key into the
// Grid's Y.Map (nested Y.Map per column for component settings), so concurrent
// edits to different fields merge cleanly.

import { calculateDropIndex, COLUMN_DRAG_TYPE, moveColumn, orderColumns, writeColumnOrder } from "../../services/yjstable/columnOrder";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import {
    type GridHandles,
    setGridComponentField,
    setGridQuery,
    setGridShowAddRowButton,
} from "../../services/yjstable/gridDocs";
import { defaultCellType, isCellComponentType } from "./cellComponents";
import SqlEditor from "./SqlEditor.svelte";

interface Props {
    grid: GridHandles;
    schema: ParsedTableSchema | undefined;
    /** Mirror of the Grid Definition query (kept in sync by the parent view). */
    query: string;
    componentTypes: Record<string, string | undefined>;
    /** Display labels for columns. */
    columnLabels: Record<string, string | undefined>;
    /** Shared visibility settings from the Grid Definition. */
    hiddenColumns: Record<string, boolean>;
    /** Columns returned by the query, including computed and joined columns. */
    resultColumns: string[];
    /** The column order stored in the Grid Definition. */
    columnOrder: string[];
    showAddRowButton?: boolean;
}

let { grid, schema, query, componentTypes, columnLabels, hiddenColumns, resultColumns, columnOrder, showAddRowButton = true }: Props = $props();

const COMPONENT_TYPES = ["text", "number", "checkbox", "select", "date"] as const;

const displayColumns = $derived.by(() => {
    const orderedNames = orderColumns(resultColumns, columnOrder);
    const colMap = new Map((schema?.columns ?? []).map((c) => [c.name, c]));
    return orderedNames.map(name => ({ name, schemaColumn: colMap.get(name) }));
});

let dropTargetColumn = $state<{ column: string; position: "above" | "below" } | undefined>(undefined);
let draggedColumnName = $state<string | undefined>(undefined);

// Committed when the SQL editor loses focus, matching the "commit when leaving
// the control" behaviour of the native input this replaced. Writing on every
// keystroke would re-run the query and churn the shared document for every
// half-typed statement.
function commitQuery(value: string) {
    setGridQuery(grid, value);
}

function setColumnLabel(column: string, label: string) {
    setGridComponentField(grid, column, "label", label.trim() === "" ? undefined : label.trim());
}

function setComponentType(column: string, type: string) {
    if (type === "auto") {
        setGridComponentField(grid, column, "type", undefined);
        return;
    }
    if (!isCellComponentType(type)) return;
    setGridComponentField(grid, column, "type", type);
}

function setColumnHidden(column: string, hidden: boolean) {
    setGridComponentField(grid, column, "hidden", hidden ? true : undefined);
}
</script>

<!--
    `data-block-dnd-owner`: the column rows below are `draggable`, and OutlinerItem's
    capture-phase `drop`/`dragover` listeners would otherwise consume the drop. The
    marker makes those handlers early-return for targets inside this subtree.

    `data-block-dnd-type` keeps that to the editor's own row drags: text or files
    dropped on the query input or a label input are not ours to claim.
-->
<div
    class="ui-def-editor"
    data-testid="yjs-table-ui-editor"
    data-block-dnd-owner="yjstable"
    data-block-dnd-type={COLUMN_DRAG_TYPE}
>
    <span class="editor-label">Query (SELECT)</span>
    <SqlEditor
        testId="yjs-table-query-input"
        ariaLabel="Query (SELECT)"
        value={query}
        minHeight={120}
        maxHeight={280}
        onBlur={commitQuery}
    />

    <div class="editor-options">
        <label class="option-label">
            <input
                type="checkbox"
                checked={showAddRowButton}
                onchange={(e) => setGridShowAddRowButton(grid, e.currentTarget.checked)}
            />
            Show Add row button
        </label>
    </div>

    {#if displayColumns.length > 0}
        <p class="editor-label">Cell components</p>
        <div class="component-rows" role="list">
            {#each displayColumns as column, index (column.name)}
                <div
                    class="component-row" role="listitem"
                    data-col={column.name}
                    draggable="true"
                    class:drop-target-above={dropTargetColumn?.column === column.name && dropTargetColumn.position === "above"}
                    class:drop-target-below={dropTargetColumn?.column === column.name && dropTargetColumn.position === "below"}
                    ondragstart={(e) => {
                        e.stopPropagation();
                        if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", column.name);
                            // Identifies this drag as a column reorder while the
                            // payload is still unreadable (see blockDndOwnership).
                            e.dataTransfer.setData(COLUMN_DRAG_TYPE, column.name);
                        }
                        draggedColumnName = column.name;
                    }}
                    ondragover={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const isAbove = e.clientY < rect.top + rect.height / 2;
                        dropTargetColumn = { column: column.name, position: isAbove ? "above" : "below" };
                        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    }}
                    ondragend={(e) => {
                        e.stopPropagation();
                        dropTargetColumn = undefined;
                        draggedColumnName = undefined;
                    }}
                    ondragleave={(e) => {
                        e.stopPropagation();
                        const related = e.relatedTarget as Node | null;
                        if (!e.currentTarget?.contains(related)) {
                            dropTargetColumn = undefined;
                        }
                    }}
                    ondrop={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const draggedCol = draggedColumnName || e.dataTransfer?.getData(COLUMN_DRAG_TYPE);
                        if (draggedCol && draggedCol !== column.name) {
                            const currentNames = displayColumns.map((c) => c.name);
                            const draggedIndex = currentNames.indexOf(draggedCol);
                            if (draggedIndex !== -1) {
                                const targetIndex = calculateDropIndex(draggedIndex, index, dropTargetColumn?.position ?? "above");
                                writeColumnOrder(grid, moveColumn(currentNames, draggedCol, targetIndex));
                            }
                        }
                        dropTargetColumn = undefined;
                        draggedColumnName = undefined;
                    }}
                >
                    <div class="drag-handle" aria-hidden="true">⋮⋮</div>
                    <span class="column-name">{column.name}</span>
                    <input
                        type="text"
                        class="column-label"
                        placeholder={column.name}
                        data-testid={`yjs-table-label-${column.name}`}
                        value={columnLabels[column.name] ?? ""}
                        onchange={(e) => setColumnLabel(column.name, (e.target as HTMLInputElement).value)}
                    />
                    <span class="column-type">{column.schemaColumn?.dataType ?? "query result"}</span>
                    <select
                        data-testid={`yjs-table-component-${column.name}`}
                        value={isCellComponentType(componentTypes[column.name])
                        ? componentTypes[column.name]
                        : "auto"}
                        onchange={(e) => setComponentType(column.name, (e.target as HTMLSelectElement).value)}
                    >
                        <option value="auto">auto ({defaultCellType(column.schemaColumn)})</option>
                        {#each COMPONENT_TYPES as type (type)}
                            <option value={type}>{type}</option>
                        {/each}
                    </select>
                    <label class="visibility-setting">
                        <input
                            type="checkbox"
                            data-testid={`yjs-table-hidden-${column.name}`}
                            checked={hiddenColumns[column.name] === true}
                            onchange={(e) => setColumnHidden(column.name, (e.target as HTMLInputElement).checked)}
                            ondragstart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                        />
                        Hidden
                    </label>
                    {#if column.schemaColumn?.checkOptions && column.schemaColumn.checkOptions.length > 0}
                        <span class="check-options" title="Options from CHECK constraint">
                            [{column.schemaColumn.checkOptions.join(", ")}]
                        </span>
                    {/if}
                </div>
            {/each}
        </div>
    {:else}
        <p class="hint">Run a query to configure its columns.</p>
    {/if}
</div>

<style>
.ui-def-editor {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.editor-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    margin: 4px 0 0;
}

input,
select {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85rem;
    background: white;
}

.component-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.component-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    padding: 2px 0;
}

.component-row.drop-target-above {
    border-top: 2px solid #2563eb;
}

.component-row.drop-target-below {
    border-bottom: 2px solid #2563eb;
}

.drag-handle {
    cursor: grab;
    color: #9ca3af;
    user-select: none;
    font-size: 1.1rem;
    line-height: 1;
    padding: 0 4px;
}

.drag-handle:active {
    cursor: grabbing;
}

.column-name {
    min-width: 8rem;
    font-family: ui-monospace, monospace;
}

.column-type {
    color: #6b7280;
    font-size: 0.75rem;
    min-width: 6rem;
}

.visibility-setting {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
}

.visibility-setting input {
    margin: 0;
}

.check-options {
    color: #6b7280;
    font-size: 0.75rem;
}

.hint {
    color: #6b7280;
    font-size: 0.8rem;
}

.editor-options {
    margin-top: 1rem;
    margin-bottom: 0.5rem;
}

.option-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--text-color);
    cursor: pointer;
}

.option-label input[type="checkbox"] {
    margin: 0;
}
</style>
