<script lang="ts">
// Structured (form) editor for the Grid Definition. There is no YAML or other
// text representation: every form input writes only its own key into the
// Grid's Y.Map (nested Y.Map per column for component settings), so concurrent
// edits to different fields merge cleanly.

import type * as Y from "yjs";
import { calculateDropIndex, COLUMN_DRAG_TYPE, moveColumn, orderColumns, writeColumnOrder } from "../../services/yjstable/columnOrder";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import {
    GRID_COLUMN_WIDTH_MAX,
    GRID_COLUMN_WIDTH_MIN,
    getGridRegistry,
    isValidGridColumnWidth,
    setGridColumnWidth,
    type GridHandles,
    setGridComponentField,
    setGridQuery,
    setGridShowAddRowButton,
    setGridConfirmRowDelete,
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
    confirmRowDelete?: boolean;
    /**
     * Saved per-column width overrides from the Grid Definition mirror, keyed
     * by exact result-column name. Only finite integers 32..4096 display as a
     * number; anything absent or malformed displays as a blank auto control.
     */
    columnWidths?: Record<string, number>;
    /**
     * Host surface restriction (outline read-only state). Presentation-width
     * editing is a surface operation, so a read-only host disables the width
     * controls and discards pending drafts. This is not project authorization:
     * an editable host's read-only SQL result still allows width editing.
     */
    isReadOnly?: boolean;
}

let { grid, schema, query, componentTypes, columnLabels, hiddenColumns, resultColumns, columnOrder, showAddRowButton = true, confirmRowDelete = false, columnWidths = {}, isReadOnly = false }: Props = $props();

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

function setColumnShown(column: string, shown: boolean) {
    setGridComponentField(grid, column, "hidden", shown ? undefined : true);
}

// --- Saved width overrides: local drafts with explicit commit ---------

// A pending numeric draft for one exact result-column name. `base` is the
// shared display the draft started from, so an observed shared change of
// this same column can discard the stale draft instead of overwriting it.
interface WidthDraft {
    text: string;
    base: string;
    /**
     * The Grid registry entry the draft started against. A synchronized
     * replacement of that entry (same Grid ID, fresh Y.Map) invalidates the
     * draft so it can never commit into an object the user never edited.
     */
    entry: Y.Map<unknown> | undefined;
    error?: string;
    notice?: string;
}

let widthDrafts = $state<Record<string, WidthDraft>>({});

/** Committed display for a column: the valid saved width, else blank (auto). */
function sharedWidthText(column: string): string {
    const saved = columnWidths[column];
    return isValidGridColumnWidth(saved) ? String(saved) : "";
}

/** Whether the captured Grid entry is still the registry's live entry. */
function isLiveGridEntry(): boolean {
    try {
        return getGridRegistry(grid.projectDoc).get(grid.gridId) === grid.entry;
    } catch {
        return false;
    }
}

function widthErrorText(text: string, badInput: boolean): string | undefined {
    if (badInput) return `Enter a whole number in ${GRID_COLUMN_WIDTH_MIN}..${GRID_COLUMN_WIDTH_MAX}, or clear to use automatic width.`;
    // The native number control accepts complete decimal and exponent
    // spellings of integral values (180.0, 1.8e2): validate the numeric value,
    // not its textual syntax. Incomplete inputs (1e, "") are NaN and reject.
    if (text === "") return `Enter a whole number in ${GRID_COLUMN_WIDTH_MIN}..${GRID_COLUMN_WIDTH_MAX}, or clear to use automatic width.`;
    const value = Number(text);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
        return `Enter a whole number in ${GRID_COLUMN_WIDTH_MIN}..${GRID_COLUMN_WIDTH_MAX}, or clear to use automatic width.`;
    }
    if (value < GRID_COLUMN_WIDTH_MIN || value > GRID_COLUMN_WIDTH_MAX) {
        return `Width must be a whole number in ${GRID_COLUMN_WIDTH_MIN}..${GRID_COLUMN_WIDTH_MAX}.`;
    }
    return undefined;
}

// The parent view mirrors the shared definition through `columnWidths`, so a
// change of the same column's saved width while a draft is pending is an
// observed external update (another placement/client, Undo/Redo): discard
// the stale draft and show the new shared value without writing anything
// back. A read-only transition, a removed column, or a replaced Grid entry
// discards drafts the same way. Disjoint updates (another column, labels,
// visibility) leave pending drafts alone. This is the one place a small
// effect is unavoidable: prop-driven invalidation of local draft state has
// no event-handler equivalent.
$effect(() => {
    const shared = columnWidths;
    const readOnly = isReadOnly;
    const liveColumns = new Set(resultColumns);
    const live = isLiveGridEntry();
    const currentEntry = grid.entry;
    for (const column of Object.keys(widthDrafts)) {
        const draft = widthDrafts[column];
        if (!draft) continue;
        if (readOnly || !live || !liveColumns.has(column)) {
            delete widthDrafts[column];
            continue;
        }
        // The Grid entry was replaced under the same ID after this draft
        // started: discard it so the pending text can never write into the
        // replacement object the user never began editing.
        if (draft.entry !== undefined && draft.entry !== currentEntry) {
            delete widthDrafts[column];
            continue;
        }
        const saved = shared[column];
        const current = isValidGridColumnWidth(saved) ? String(saved) : "";
        if (current !== draft.base) {
            widthDrafts[column] = {
                text: current,
                base: current,
                entry: currentEntry,
                notice: "Width changed elsewhere; your draft was discarded.",
            };
        }
    }
});

/** Commit one column's pending text (Enter or focus leaving the control). */
function commitWidth(column: string, input: HTMLInputElement) {
    const draft = widthDrafts[column];
    // A draft captured against a Grid entry that has since been replaced
    // under the same ID must never write into the replacement object.
    if (draft?.entry !== undefined && draft.entry !== grid.entry) {
        delete widthDrafts[column];
        return;
    }
    const text = (draft?.text ?? input.value).trim();
    const badInput = input.validity?.badInput ?? false;
    if (isReadOnly || !isLiveGridEntry() || !resultColumns.includes(column)) {
        delete widthDrafts[column];
        return;
    }
    if (text === "" && !badInput) {
        try {
            // A genuinely empty input resets to auto. The shared writer's
            // no-op contract keeps an already-auto column effect-free.
            setGridColumnWidth(grid, column, undefined);
        } catch (error) {
            widthDrafts[column] = { text: draft?.text ?? "", base: draft?.base ?? sharedWidthText(column), entry: draft?.entry ?? grid.entry, error: String(error) };
            return;
        }
        delete widthDrafts[column];
        return;
    }
    const problem = widthErrorText(text, badInput);
    if (problem !== undefined) {
        widthDrafts[column] = { text: draft?.text ?? input.value, base: draft?.base ?? sharedWidthText(column), entry: draft?.entry ?? grid.entry, error: problem };
        return;
    }
    try {
        // The shared width operation: one isolated Grid Undo step, or a
        // canonical no-op with no Yjs update or history entry.
        setGridColumnWidth(grid, column, Number(text));
    } catch (error) {
        widthDrafts[column] = { text: draft?.text ?? input.value, base: draft?.base ?? sharedWidthText(column), entry: draft?.entry ?? grid.entry, error: String(error) };
        return;
    }
    delete widthDrafts[column];
}

/** Discard one column's pending draft and restore the saved display. */
function discardWidthDraft(column: string) {
    delete widthDrafts[column];
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
        <label>
            <input
                type="checkbox"
                checked={confirmRowDelete}
                onchange={(e) => setGridConfirmRowDelete(grid, e.currentTarget.checked)}
            />
            Confirm before deleting rows
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
                            checked={hiddenColumns[column.name] !== true}
                            onchange={(e) => setColumnShown(column.name, (e.target as HTMLInputElement).checked)}
                            ondragstart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                        />
                        Shown
                    </label>
                    <label class="width-setting">
                        Width (px)
                        <input
                            type="number"
                            class="column-width"
                            min={GRID_COLUMN_WIDTH_MIN}
                            max={GRID_COLUMN_WIDTH_MAX}
                            step="1"
                            inputmode="numeric"
                            placeholder="auto"
                            title={(widthDrafts[column.name]?.text ?? sharedWidthText(column.name)) === ""
                                ? `Automatic width for ${column.name}`
                                : `Saved width for ${column.name} in CSS pixels`}
                            aria-label={`Width (px) for ${column.name}`}
                            aria-invalid={widthDrafts[column.name]?.error !== undefined}
                            data-testid={`yjs-table-width-${column.name}`}
                            value={widthDrafts[column.name]?.text ?? sharedWidthText(column.name)}
                            disabled={isReadOnly}
                            oninput={(e) => {
                                const input = e.currentTarget as HTMLInputElement;
                                widthDrafts[column.name] = {
                                    text: input.value,
                                    base: widthDrafts[column.name]?.base ?? sharedWidthText(column.name),
                                    entry: widthDrafts[column.name]?.entry ?? grid.entry,
                                };
                            }}
                            onkeydown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    commitWidth(column.name, e.currentTarget as HTMLInputElement);
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    discardWidthDraft(column.name);
                                }
                            }}
                            onfocusout={(e) => {
                                if (widthDrafts[column.name] !== undefined) {
                                    commitWidth(column.name, e.currentTarget as HTMLInputElement);
                                }
                            }}
                            ondragstart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                        />
                    </label>
                    {#if (widthDrafts[column.name]?.text ?? sharedWidthText(column.name)) === ""}
                        <span class="width-auto" aria-hidden="true">auto</span>
                    {/if}
                    {#if widthDrafts[column.name]?.error}
                        <p class="width-error" role="alert" data-testid={`yjs-table-width-error-${column.name}`}>
                            {widthDrafts[column.name]?.error}
                        </p>
                    {/if}
                    {#if widthDrafts[column.name]?.notice}
                        <p class="width-notice" role="status" data-testid={`yjs-table-width-notice-${column.name}`}>
                            {widthDrafts[column.name]?.notice}
                        </p>
                    {/if}
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

.width-setting {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    font-size: 0.75rem;
    color: #6b7280;
}

.column-width {
    width: 5.5rem;
}

.column-width[aria-invalid="true"] {
    border-color: #dc2626;
}

.width-auto {
    font-size: 0.75rem;
    color: #6b7280;
}

.width-error {
    font-size: 0.75rem;
    color: #dc2626;
    margin: 0;
}

.width-notice {
    font-size: 0.75rem;
    color: #92400e;
    margin: 0;
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
