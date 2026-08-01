<script lang="ts">
// Structured (form) editor for the UI Definition Y.Map. There is no YAML or
// other text representation: every form input writes only its own key into
// the Y.Map (nested Y.Map per column for component settings), so concurrent
// edits to different fields merge cleanly.

import * as Y from "yjs";
import { COLUMN_DRAG_TYPE, moveColumn, orderColumns, writeColumnOrder } from "../../services/yjstable/columnOrder";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import { defaultCellType, isCellComponentType } from "./cellComponents";

interface Props {
    handles: TableHandles;
    schema: ParsedTableSchema | undefined;
    /** Mirror of the UI Definition (kept in sync by the parent view). */
    query: string;
    componentTypes: Record<string, string | undefined>;
    /** Display labels for columns. */
    columnLabels: Record<string, string | undefined>;
    /** The column order stored in UI Definition. */
    columnOrder: string[];
}

let { handles, schema, query, componentTypes, columnLabels, columnOrder }: Props = $props();

const COMPONENT_TYPES = ["text", "number", "checkbox", "select", "date"] as const;

const displayColumns = $derived.by(() => {
    if (!schema) return [];
    const orderedNames = orderColumns(
        schema.columns.map((c) => c.name),
        columnOrder,
    );
    const colMap = new Map(schema.columns.map((c) => [c.name, c]));
    return orderedNames.map((name) => colMap.get(name)!).filter(Boolean);
});

let dropTargetColumn = $state<{ column: string; position: "above" | "below" } | undefined>(undefined);

function commitQuery(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    handles.uiDef.set("query", value);
}

function componentsMap(): Y.Map<unknown> {
    let components = handles.uiDef.get("components");
    if (!(components instanceof Y.Map)) {
        components = new Y.Map<unknown>();
        handles.uiDef.set("components", components);
    }
    return components as Y.Map<unknown>;
}

function setColumnLabel(column: string, label: string) {
    handles.doc.transact(() => {
        const components = componentsMap();
        const trimmed = label.trim();
        const existing = components.get(column);
        const cfg = (existing instanceof Y.Map ? existing : new Y.Map<unknown>()) as Y.Map<unknown>;
        if (!(existing instanceof Y.Map)) components.set(column, cfg);

        if (trimmed === "") {
            cfg.delete("label");
            if (Array.from(cfg.keys()).length === 0) {
                components.delete(column);
            }
        }
        else cfg.set("label", trimmed);
    });
}

function setComponentType(column: string, type: string) {
    handles.doc.transact(() => {
        const components = componentsMap();
        const existing = components.get(column);

        if (type === "auto") {
            // Delete type. If label is also empty, delete entire entry.
            if (existing instanceof Y.Map) {
                existing.delete("type");
                if (Array.from(existing.keys()).length === 0) {
                    components.delete(column);
                }
            }
            return;
        }

        if (!isCellComponentType(type)) return;

        const cfg = (existing instanceof Y.Map ? existing : new Y.Map<unknown>()) as Y.Map<unknown>;
        if (!(existing instanceof Y.Map)) components.set(column, cfg);
        cfg.set("type", type);
    });
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
    <label class="editor-label" for="yjs-table-query-input">Query (SELECT)</label>
    <input
        id="yjs-table-query-input"
        data-testid="yjs-table-query-input"
        type="text"
        spellcheck="false"
        value={query}
        onchange={commitQuery}
    />

    {#if schema}
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
                        if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", column.name);
                            // Identifies this drag as a column reorder while the
                            // payload is still unreadable (see blockDndOwnership).
                            e.dataTransfer.setData(COLUMN_DRAG_TYPE, column.name);
                        }
                    }}
                    ondragover={(e) => {
                        e.preventDefault();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const isAbove = e.clientY < rect.top + rect.height / 2;
                        dropTargetColumn = { column: column.name, position: isAbove ? "above" : "below" };
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
                        const draggedCol = e.dataTransfer?.getData(COLUMN_DRAG_TYPE);
                        if (draggedCol && draggedCol !== column.name) {
                            const currentNames = displayColumns.map((c) => c.name);
                            const draggedIndex = currentNames.indexOf(draggedCol);
                            if (draggedIndex !== -1) {
                                let targetIndex = index;
                                if (draggedIndex < targetIndex && dropTargetColumn?.position === "above") {
                                    targetIndex -= 1;
                                } else if (draggedIndex > targetIndex && dropTargetColumn?.position === "below") {
                                    targetIndex += 1;
                                }
                                writeColumnOrder(handles, moveColumn(currentNames, draggedCol, targetIndex));
                            }
                        }
                        dropTargetColumn = undefined;
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
                    <span class="column-type">{column.dataType}</span>
                    <select
                        data-testid={`yjs-table-component-${column.name}`}
                        value={isCellComponentType(componentTypes[column.name])
                        ? componentTypes[column.name]
                        : "auto"}
                        onchange={(e) => setComponentType(column.name, (e.target as HTMLSelectElement).value)}
                    >
                        <option value="auto">auto ({defaultCellType(column)})</option>
                        {#each COMPONENT_TYPES as type (type)}
                            <option value={type}>{type}</option>
                        {/each}
                    </select>
                    {#if column.checkOptions && column.checkOptions.length > 0}
                        <span class="check-options" title="Options from CHECK constraint">
                            [{column.checkOptions.join(", ")}]
                        </span>
                    {/if}
                </div>
            {/each}
        </div>
    {:else}
        <p class="hint">Apply a schema to configure cell components.</p>
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

.check-options {
    color: #6b7280;
    font-size: 0.75rem;
}

.hint {
    color: #6b7280;
    font-size: 0.8rem;
}
</style>
