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
import { calculateDropIndex, COLUMN_DRAG_TYPE, moveColumn, orderColumns, writeColumnOrder } from "../../services/yjstable/columnOrder";
import {
    addRecord,
    setRecordValue,
    type TableHandles,
    type TableRecordValue,
} from "../../services/yjstable/tableDocs";
import type { GridHandles } from "../../services/yjstable/gridDocs";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import { GridSelection, type GridCellAddress } from "../../services/yjstable/gridSelection";
import { isPrintableKey, moveActiveCell, type GridNavDirection } from "../../services/yjstable/gridKeyboardNav";
import {
    applyValueToSelection,
    type GridCommandContext,
    type GridCommandRowTarget,
    planGridDeleteCommand,
    removeRowTargets,
    summarizeSelection,
} from "../../services/yjstable/gridSelectionCommands";
import { cellComponentFor, cellComponentTypeFor } from "./cellComponents";
import ConfirmDialog from "../ConfirmDialog.svelte";
import { untrack } from "svelte";

interface Props {
    /**
     * The Grid definition being rendered (owns column order + labels + hidden).
     * Omitted by the Table's own raw-data browser, which has no Grid entity:
     * there a column reorder is ephemeral (`onColumnOrderChange`) and nothing
     * about the presentation is persisted (issue #5012).
     */
    grid?: GridHandles;
    /** Receives a reorder when there is no Grid to persist it into. */
    onColumnOrderChange?: (order: string[]) => void;
    /** Source Table handles: writes for editable cells go here. */
    handles: TableHandles;
    schema: ParsedTableSchema | undefined;
    query: string;
    result: TableQueryResult;
    /** Component type per column from the Grid Definition mirror. */
    componentTypes: Record<string, string | undefined>;
    /** The column order stored in the Grid Definition. */
    columnOrder: string[];
    /** Display labels for columns. */
    columnLabels: Record<string, string | undefined>;
    /** Columns hidden by the Grid Definition. */
    hiddenColumns: Record<string, boolean>;
    /** Whether the Grid shows the "+ Add row" button when editable (default true). */
    showAddRowButton?: boolean;
    /**
     * "query" (default): row creation relies on the query result being editable and addressing rows by `id`.
     * "table": row creation relies only on a valid, writable schema existing, used for raw table data browsers.
     */
    rowCreationMode?: "query" | "table";
    /** Whether the table is still loading initial data from the network/storage. */
    loading?: boolean;
    /** Resolves the relation provider a unioned row's `source_kind` names. */
    session: RelationResolver;
    /** Whether deleting a row requires confirmation (default false). */
    confirmRowDelete?: boolean;
}

let gridContainer: HTMLElement | undefined = $state();

let {
    grid,
    onColumnOrderChange,
    handles,
    schema,
    query,
    result,
    componentTypes,
    columnOrder,
    columnLabels,
    hiddenColumns,
    showAddRowButton = true,
    rowCreationMode = "query",
    loading = false,
    session,
    confirmRowDelete = false,
}: Props = $props();

let rowToDelete: string | null = $state(null);
/** Pending selection-aware row removal (FTR-5191), awaiting the same confirmation as a single row delete. */
let bulkRowsToDelete: GridCommandRowTarget[] | undefined = $state(undefined);
let isConfirmDialogOpen: boolean = $state(false);
const selection = new GridSelection();
let selectionRevision = $state(0);

/**
 * There is one active cell editor at a time (never multiple synthesized
 * carets). `undefined` means Grid is in navigation mode: arrow keys move the
 * active cell instead of a foreign editor's cursor/selection.
 */
let editingCell: GridCellAddress | undefined = $state();
/**
 * Initial text for the cell named by `editingCell`, set once when a
 * printable keystroke opens the editor. Stays referentially stable for the
 * lifetime of that edit session (cleared only when the session ends), so
 * TextCell/NumberCell's `value={editSeed ?? ...}` never re-evaluates to a
 * different value mid-edit and clobbers what the user has typed since.
 */
let pendingEditSeed: string | undefined = $state();

const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 350;
const TOUCH_SLOP_PX = 10;
let touchSelectionMode = $state(false);
let additiveTouchSelection = $state(false);
let handleDrag = $state<"anchor" | "focus" | undefined>();
let handleOppositeCell: GridCellAddress | undefined;
let touchStart: { pointerId: number; x: number; y: number; cell: GridCellAddress; } | undefined;
let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let lastTap: { at: number; cell: GridCellAddress; } | undefined;
let suppressClickUntil = 0;

/** Row-identity columns: metadata about the row, never shown as "read-only data". */
const IDENTITY_COLUMNS = new Set(["id", SOURCE_KIND_COLUMN, SOURCE_ID_COLUMN]);

const editability = $derived(analyzeQueryEditability(query, schema, result.columns));
const columnByName = $derived(new Map((schema?.columns ?? []).map((c) => [c.name, c])));
const effectiveColumns = $derived(orderColumns(result.columns, columnOrder));
const displayColumns = $derived(effectiveColumns.filter(column => hiddenColumns[column] !== true));

/** One row target per query result row, for the selection command layer (`gridSelectionCommands.ts`). */
function buildRowTargets(): Map<string, GridCommandRowTarget> {
    const map = new Map<string, GridCommandRowTarget>();
    for (const row of result.rows) {
        const rowId = selectableRowId(row);
        if (rowId === undefined) continue;
        map.set(rowId, { row, recordId: recordIdOf(row), source: sourceOf(row) });
    }
    return map;
}

const commandContext = $derived<GridCommandContext>({
    handles,
    session,
    rowTargets: buildRowTargets(),
    columnOrder: displayColumns,
    editableColumns: editability.editableColumns,
    valueKindOf: (columnId) => cellComponentTypeFor(componentTypes[columnId], columnByName.get(columnId)),
    checkOptionsOf: (columnId) => columnByName.get(columnId)?.checkOptions,
});

const selectionSummary = $derived.by(() => {
    void selectionRevision;
    return summarizeSelection(selection, commandContext);
});

/** Persist a visible-column reorder without dropping or moving hidden slots. */
function writeVisibleColumnOrder(visibleOrder: string[]) {
    let visibleIndex = 0;
    const fullOrder = effectiveColumns.map(column =>
        hiddenColumns[column] === true ? column : visibleOrder[visibleIndex++]
    );
    if (grid) {
        writeColumnOrder(grid, fullOrder);
        return;
    }
    onColumnOrderChange?.(fullOrder);
}

/** Presentation label for a column; falls back to the SQL name. */
function headerLabel(column: string): string {
    const label = columnLabels[column];
    return label !== undefined && label !== "" ? label : column;
}

let dropTargetColumn = $state<{ column: string; position: "left" | "right" } | undefined>(undefined);
let draggedColumnName = $state<string | undefined>(undefined);

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

/** Rows without a durable query identity are intentionally not selectable. */
function selectableRowId(row: Record<string, unknown>): string | undefined {
    // Query editability is a write concern. Read-only DISTINCT/aggregate
    // results may still expose durable identity columns suitable for local
    // selection, so do not gate identity on editability.rowIdentity.
    if (typeof row.source_kind === "string" && typeof row.source_id === "string") {
        return `${row.source_kind}:${row.source_id}`;
    }
    return typeof row.id === "string" ? row.id : undefined;
}

function rowIdsOf(rows: TableQueryResult["rows"]): string[] {
    return rows.flatMap(row => {
        const id = selectableRowId(row);
        return id === undefined ? [] : [id];
    });
}

function reconcileSelection(rows: TableQueryResult["rows"], columns: string[]): void {
    selection.reconcile(rowIdsOf(rows), columns);
    selectionRevision = untrack(() => selectionRevision) + 1;
}

function selectCell(event: MouseEvent, cell: GridCellAddress): void {
    if (event.shiftKey) selection.extend(cell, rowIdsOf(result.rows), displayColumns);
    else if (event.ctrlKey || event.metaKey) {
        // Modifier-click belongs to selection, not the cell editor. Without
        // stopping propagation, editable cells immediately replace the
        // toggled multi-selection when their button enters edit mode.
        event.stopPropagation();
        selection.toggleCell(cell);
    }
    else selection.select(cell);
    selectionRevision++;
    // A mouse click always picks its own target; never let a stale keyboard
    // edit session steal focus back onto a different cell afterwards.
    editingCell = undefined;
    pendingEditSeed = undefined;
}

function sameCell(left: GridCellAddress | undefined, right: GridCellAddress): boolean {
    return left?.rowId === right.rowId && left.columnId === right.columnId;
}

function finishSelectionChange(): void {
    selectionRevision++;
    editingCell = undefined;
    pendingEditSeed = undefined;
}

function selectTouchCell(cell: GridCellAddress): void {
    if (additiveTouchSelection) selection.toggleCell(cell);
    else selection.select(cell);
    finishSelectionChange();
}

function cancelLongPress(): void {
    if (longPressTimer !== undefined) clearTimeout(longPressTimer);
    longPressTimer = undefined;
}

/**
 * Touch starts as an undecided gesture. It does not capture the pointer or
 * preventDefault, so a move beyond the slop remains native table scrolling.
 */
function touchCellPointerDown(event: PointerEvent, cell: GridCellAddress): void {
    if (event.pointerType !== "touch") return;
    cancelLongPress();
    touchStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cell };
    longPressTimer = setTimeout(() => {
        if (!touchStart || touchStart.pointerId !== event.pointerId) return;
        touchSelectionMode = true;
        selection.extend(cell, rowIdsOf(result.rows), displayColumns);
        finishSelectionChange();
        navigator.vibrate?.(10);
        longPressTimer = undefined;
    }, LONG_PRESS_MS);
}

function touchCellPointerMove(event: PointerEvent): void {
    if (!touchStart || event.pointerId !== touchStart.pointerId) return;
    if (Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > TOUCH_SLOP_PX) {
        cancelLongPress();
        touchStart = undefined;
    }
}

function touchCellPointerUp(event: PointerEvent): void {
    if (event.pointerType !== "touch" || !touchStart || event.pointerId !== touchStart.pointerId) return;
    const cell = touchStart.cell;
    const longPressed = longPressTimer === undefined;
    cancelLongPress();
    touchStart = undefined;
    suppressClickUntil = Date.now() + 500;
    if (longPressed) return;

    const isDoubleTap = lastTap !== undefined && sameCell(lastTap.cell, cell)
        && Date.now() - lastTap.at <= DOUBLE_TAP_MS;
    if (isDoubleTap) {
        selection.select(cell);
        selectionRevision++;
        // Let this tap's native click reach the cell control. Text/number
        // buttons enter edit mode, while checkbox/select/date keep their own
        // platform-native activation and virtual-keyboard behavior.
        suppressClickUntil = 0;
        lastTap = undefined;
        return;
    }
    selectTouchCell(cell);
    lastTap = { at: Date.now(), cell };
}

function suppressSyntheticTouchClick(event: MouseEvent): void {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
}

function cellAtPoint(x: number, y: number): GridCellAddress | undefined {
    const td = document.elementFromPoint(x, y)?.closest<HTMLElement>("td[data-row-id][data-col]");
    const rowId = td?.dataset.rowId;
    const columnId = td?.dataset.col;
    return rowId && columnId ? { rowId, columnId } : undefined;
}

function startHandleDrag(event: PointerEvent, end: "anchor" | "focus"): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    handleDrag = end;
    const snapshot = selection.snapshot();
    handleOppositeCell = end === "anchor" ? snapshot.activeCell : snapshot.anchorCell;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function moveHandle(event: PointerEvent): void {
    if (!handleDrag) return;
    event.preventDefault();
    const cell = cellAtPoint(event.clientX, event.clientY);
    if (!cell) return;
    selection.select(handleOppositeCell ?? cell);
    selection.extend(cell, rowIdsOf(result.rows), displayColumns);
    selectionRevision++;
}

function stopHandleDrag(): void {
    handleDrag = undefined;
    handleOppositeCell = undefined;
}

function isSelectionEnd(cell: GridCellAddress, end: "anchor" | "focus"): boolean {
    void selectionRevision;
    const snapshot = selection.snapshot();
    return sameCell(end === "anchor" ? snapshot.anchorCell : snapshot.activeCell, cell);
}

function leaveTouchSelectionMode(): void {
    touchSelectionMode = false;
    additiveTouchSelection = false;
    handleDrag = undefined;
}

function activeSelectionCell(): GridCellAddress | undefined {
    void selectionRevision;
    return selection.snapshot().activeCell;
}

function editActiveTouchCell(): void {
    const cell = activeSelectionCell();
    if (!cell || !gridContainer) return;
    leaveTouchSelectionMode();
    const td = gridContainer.querySelector<HTMLElement>(
        `td[data-row-id="${CSS.escape(cell.rowId)}"][data-col="${CSS.escape(cell.columnId)}"]`,
    );
    const control = td?.querySelector<HTMLElement>("button, input, select");
    if (control instanceof HTMLButtonElement) control.click();
    else control?.focus();
}

function headerOptions(event: MouseEvent | KeyboardEvent) {
    return { extend: event.shiftKey, toggle: event.ctrlKey || event.metaKey || additiveTouchSelection };
}

function selectRowHeader(event: MouseEvent | KeyboardEvent, rowId: string): void {
    selection.selectRow(rowId, rowIdsOf(result.rows), headerOptions(event));
    selectionRevision++;
    editingCell = undefined;
    pendingEditSeed = undefined;
}

function selectColumnHeader(event: MouseEvent | KeyboardEvent, columnId: string): void {
    selection.selectColumn(columnId, displayColumns, headerOptions(event));
    selectionRevision++;
    editingCell = undefined;
    pendingEditSeed = undefined;
}

function selectAllResult(): void {
    selection.selectAll();
    selectionRevision++;
    editingCell = undefined;
    pendingEditSeed = undefined;
}

function rowSelected(rowId: string): boolean {
    void selectionRevision;
    return selection.containsRow(rowId);
}

function columnSelected(columnId: string): boolean {
    void selectionRevision;
    return selection.containsColumn(columnId);
}

function allSelected(): boolean {
    void selectionRevision;
    return selection.isAllSelected();
}

function activateHeader(event: KeyboardEvent, action: () => void): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
}

function cellSelected(cell: GridCellAddress): boolean {
    void selectionRevision;
    return selection.contains(cell);
}

function cellActive(cell: GridCellAddress): boolean {
    void selectionRevision;
    return selection.isActive(cell);
}

function cellEditing(cell: GridCellAddress): boolean {
    return editingCell !== undefined && editingCell.rowId === cell.rowId && editingCell.columnId === cell.columnId;
}

$effect.pre(() => {
    reconcileSelection(result.rows, displayColumns);
});

/** Bulk-safe value kinds: committing one of these while several writable cells are selected applies the value to all of them (FTR-5191). */
const BULK_COMMIT_KINDS = new Set(["checkbox", "select"]);

function commitCell(row: Record<string, unknown>, column: string, value: TableRecordValue) {
    const rowId = selectableRowId(row);
    const cell: GridCellAddress | undefined = rowId !== undefined ? { rowId, columnId: column } : undefined;
    if (cell && selection.contains(cell) && BULK_COMMIT_KINDS.has(commandContext.valueKindOf(column))) {
        const summary = summarizeSelection(selection, commandContext);
        if (summary.writableTargets.length > 1) {
            applyValueToSelection(selection, commandContext, value);
            return;
        }
    }
    const recordId = recordIdOf(row);
    if (recordId !== undefined) {
        setRecordValue(handles, recordId, column, value);
        return;
    }
    const source = sourceOf(row);
    if (source) void applyUnionedRowEdit(session, source.sourceKind, source.sourceId, column, value);
}

/** Focuses `cell`'s control right now if its DOM already exists. Returns whether it did. */
function tryFocusLogicalCell(cell: GridCellAddress): boolean {
    if (!gridContainer) return false;
    const td = gridContainer.querySelector<HTMLElement>(
        `td[data-row-id="${CSS.escape(cell.rowId)}"][data-col="${CSS.escape(cell.columnId)}"]`,
    );
    if (!td) return false;

    // Scrolling is the cosmetic half; focus is the point. Guarded so an
    // environment without `scrollIntoView` (jsdom) loses the scroll rather
    // than the whole navigation.
    td.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const focusable = td.querySelector<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
        "button, input, select",
    );
    // A disabled control (read-only select/date/checkbox) cannot take focus;
    // the logical active cell is still updated, DOM focus just stays put.
    if (focusable && !focusable.disabled) focusable.focus();
    return true;
}

/**
 * Focus the interactive control for a logical cell, addressed only by its
 * durable row/column identity (never a DOM row index). Plain keyboard
 * navigation focuses synchronously -- the target cell's DOM is untouched, so
 * any deferral would risk losing to the next keystroke in a fast sequence.
 *
 * `deferred` opts a caller into waiting a frame first, for the cases that
 * need it: exiting edit mode, whether back onto the very cell that was just
 * edited (Escape, or Enter/Tab clamped at the grid edge -- its `<input>` is
 * mid-swap back to its `<button>` this same tick) or onto a different cell
 * (Enter/Tab committing and moving). Both need this, for different reasons:
 * a same-tick query would still find the outgoing `<input>`, and -- subtler
 * -- focusing a *different* button synchronously mid-keydown leaves it
 * focused when the same Enter/Space keystroke's `keyup` reaches the browser,
 * whose default action synthesizes a `click` on whatever button has focus,
 * silently reopening that cell for editing. `requestAnimationFrame` outlives
 * both hazards, matching the original #5181 fix. A query refresh (Yjs write
 * -> PGlite -> debounced re-query) can replace the underlying `<tr>`/`<td>`
 * on a slower, real async timeline regardless, so this also retries across a
 * few animation frames when the cell still isn't there.
 */
function focusLogicalCell(cell: GridCellAddress, attempts = 0, deferred = false) {
    if (deferred) {
        requestAnimationFrame(() => focusLogicalCell(cell, attempts));
        return;
    }
    if (tryFocusLogicalCell(cell)) return;
    if (attempts > 10 || !gridContainer) return;

    requestAnimationFrame(() => focusLogicalCell(cell, attempts + 1));
}

/** Move the logical active cell and focus it; `extend` grows the selection from the anchor instead of replacing it. */
function moveActive(
    origin: GridCellAddress,
    direction: GridNavDirection,
    extend: boolean,
    wrap: boolean,
    deferred = false,
) {
    const rows = rowIdsOf(result.rows);
    const target = moveActiveCell(origin, direction, rows, displayColumns, { wrap }) ?? origin;
    if (extend) selection.extend(target, rows, displayColumns);
    else selection.select(target);
    selectionRevision++;
    editingCell = undefined;
    pendingEditSeed = undefined;
    focusLogicalCell(target, 0, deferred);
}

/** Called by a cell editor's keyboard commit (Enter/Tab) or cancel (Escape). */
function exitCellEdit(cell: GridCellAddress, direction?: GridNavDirection) {
    editingCell = undefined;
    pendingEditSeed = undefined;
    if (!direction) {
        selection.select(cell);
        selectionRevision++;
        focusLogicalCell(cell, 0, true);
        return;
    }
    // Tab/Shift+Tab wrap to the adjacent row at the edge; Enter/Shift+Enter clamp.
    const wrap = direction === "left" || direction === "right";
    moveActive(cell, direction, false, wrap, true);
}

/**
 * Grid-level keyboard navigation, delegated on the container so it applies
 * uniformly to every cell without per-component wiring. Stands down whenever
 * focus is inside a text/number cell's own input (that component owns
 * Enter/Tab/Escape itself) or an IME composition is in progress, and never
 * intercepts arrow keys while a native select/date/checkbox control has
 * focus -- Outliner's documented exception keeping those keys native.
 */
function handleGridKeyDown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.classList.contains("cell-input")) return;

    if (event.key === "Delete" || event.key === "Backspace") {
        // Not gated on a `td[data-row-id]` target: a `rows`-kind selection's
        // DOM focus sits on the row header `<th>` it was picked from, not a
        // cell, and this command must still fire from there.
        event.preventDefault();
        runDeleteCommand();
        return;
    }

    const td = target.closest<HTMLElement>("td[data-row-id]");
    if (!td) return;
    const rowId = td.dataset.rowId;
    const columnId = td.dataset.col;
    if (!rowId || !columnId) return;
    const cell: GridCellAddress = { rowId, columnId };

    const isForeignEditor = target instanceof HTMLInputElement || target instanceof HTMLSelectElement;

    const arrowDirection: Partial<Record<string, GridNavDirection>> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
    };
    const direction = arrowDirection[event.key];
    if (direction) {
        // Native select/date/checkbox controls own arrow keys while focused
        // (e.g. cycling a select's options); Grid does not intercept them.
        if (isForeignEditor) return;
        event.preventDefault();
        moveActive(cell, direction, event.shiftKey, false);
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) {
            moveActive(cell, "up", false, false);
            return;
        }
        if (target.tagName === "BUTTON") {
            // Reuses the button's own editable-gated click-to-edit handler.
            target.click();
            return;
        }
        // select/date/checkbox commit on `change` already; Enter just moves down.
        moveActive(cell, "down", false, false);
        return;
    }

    if (event.key === "Tab") {
        event.preventDefault();
        moveActive(cell, event.shiftKey ? "left" : "right", false, true);
        return;
    }

    if (event.key === "F2") {
        if (target.tagName === "BUTTON") {
            event.preventDefault();
            target.click();
        }
        return;
    }

    if (target.tagName === "BUTTON" && isPrintableKey(event)) {
        event.preventDefault();
        selection.select(cell);
        selectionRevision++;
        editingCell = cell;
        pendingEditSeed = event.key;
    }
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
    if (confirmRowDelete) {
        rowToDelete = recordId;
        isConfirmDialogOpen = true;
    } else {
        removeRowTargets(commandContext, [{ row: {}, recordId }]);
    }
}

/**
 * The selection-aware Delete/Backspace command (FTR-5191). A `rows`-kind
 * selection removes the selected records -- honoring the same per-Grid
 * "confirm before deleting rows" option as the row action button, including
 * when triggered from the keyboard. Any other selection kind (a cell/range,
 * a column, or the whole result via select-all) clears writable cell
 * contents instead: it must never fall back to a destructive whole-result
 * row removal.
 */
function runDeleteCommand(): void {
    const plan = planGridDeleteCommand(selection, commandContext);
    if (plan.kind === "clear-cells") return;
    if (plan.targets.length === 0) return;
    if (confirmRowDelete) {
        bulkRowsToDelete = plan.targets;
        isConfirmDialogOpen = true;
        return;
    }
    removeRowTargets(commandContext, plan.targets);
}

function handleConfirmDelete() {
    if (bulkRowsToDelete) {
        removeRowTargets(commandContext, bulkRowsToDelete);
        bulkRowsToDelete = undefined;
        return;
    }
    if (rowToDelete) {
        removeRowTargets(commandContext, [{ row: {}, recordId: rowToDelete }]);
        rowToDelete = null;
    }
}

function handleCancelDelete() {
    rowToDelete = null;
    bulkRowsToDelete = undefined;
}
</script>

<svelte:window
    onpointermove={moveHandle}
    onpointerup={stopHandleDrag}
    onpointercancel={() => {
        stopHandleDrag();
        cancelLongPress();
        touchStart = undefined;
    }}
/>

<!--
    `data-block-dnd-owner` marks this subtree as owning its own drag & drop.
    OutlinerItem registers capture-phase `drop`/`dragover` listeners on the item
    root and would otherwise swallow the column-header drop before the `th`'s own
    bubble-phase handler runs; it early-returns for targets inside this marker.

    `data-block-dnd-type` narrows that to the grid's own column drags, which carry
    COLUMN_DRAG_TYPE. Files, outliner items and text dropped on a body cell are
    not the grid's business and keep reaching the host item's handlers.
-->
<div
    class="yjs-table-grid"
    data-testid="yjs-table-grid"
    data-block-dnd-owner="yjstable"
    data-block-dnd-type={COLUMN_DRAG_TYPE}
    bind:this={gridContainer}
>
    {#if loading}
        <p class="loading-state" data-testid="yjs-table-loading">Loading table...</p>
    {:else if result.columns.length > 0}
        {#if selectionSummary.kind === "cells" && selectionSummary.totalCells > 1}
            <p class="grid-selection-status" data-testid="grid-selection-status">
                {selectionSummary.totalCells} cells selected · {selectionSummary.writableTargets.length} editable
            </p>
        {/if}
        <table role="grid" onkeydown={handleGridKeyDown}>
            <thead>
                <tr>
                    <th
                        class="selection-header corner-header"
                        class:header-selected={allSelected()}
                        scope="col"
                        role="columnheader"
                        tabindex="0"
                        aria-label="Select current query result"
                        aria-selected={allSelected()}
                        onclick={selectAllResult}
                        onkeydown={(event) => activateHeader(event, selectAllResult)}
                    >▦</th>
                    {#each displayColumns as column, index (column)}
                        <th
                            scope="col"
                            role="columnheader"
                            tabindex="0"
                            data-col={column}
                            aria-selected={columnSelected(column)}
                            class:header-selected={columnSelected(column)}
                            onclick={(event) => {
                                if (!(event.target as HTMLElement).closest(".column-drag-handle")) {
                                    selectColumnHeader(event, column);
                                }
                            }}
                            title={columnLabels[column] ? column : undefined}
                            class:drop-target-left={dropTargetColumn?.column === column && dropTargetColumn.position === "left"}
                            class:drop-target-right={dropTargetColumn?.column === column && dropTargetColumn.position === "right"}
                            ondragover={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const isLeft = e.clientX < rect.left + rect.width / 2;
                                dropTargetColumn = { column, position: isLeft ? "left" : "right" };
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
                                if (draggedCol && draggedCol !== column) {
                                    const draggedIndex = displayColumns.indexOf(draggedCol);
                                    if (draggedIndex !== -1) {
                                        const targetIndex = calculateDropIndex(draggedIndex, index, dropTargetColumn?.position ?? "left");
                                        writeVisibleColumnOrder(moveColumn(displayColumns, draggedCol, targetIndex));
                                    }
                                }
                                dropTargetColumn = undefined;
                                draggedColumnName = undefined;
                            }}
                            onkeydown={(e) => {
                                if ((e.key === "Enter" || e.key === " ") && !e.altKey) {
                                    activateHeader(e, () => selectColumnHeader(e, column));
                                    return;
                                }
                                if (e.altKey) {
                                    if (e.key === "ArrowLeft" && index > 0) {
                                        e.preventDefault();
                                        writeVisibleColumnOrder(moveColumn(displayColumns, column, index - 1));
                                    } else if (e.key === "ArrowRight" && index < displayColumns.length - 1) {
                                        e.preventDefault();
                                        writeVisibleColumnOrder(moveColumn(displayColumns, column, index + 1));
                                    }
                                }
                            }}
                        >
                            <div class="th-content">
                                <span class="th-label">
                                    {headerLabel(column)}
                                    {#if editability.editable && !editability.editableColumns.has(column) && !IDENTITY_COLUMNS.has(column)}
                                        <span class="readonly-mark" title="Read-only column">RO</span>
                                    {/if}
                                </span>
                                <div
                                    class="column-drag-handle"
                                    role="button"
                                    tabindex="-1"
                                    aria-label={`Drag to reorder ${column}`}
                                    draggable="true"
                                    data-testid="yjs-table-column-drag-handle"
                                    ondragstart={(e) => {
                                        e.stopPropagation();
                                        if (e.dataTransfer) {
                                            e.dataTransfer.effectAllowed = "move";
                                            e.dataTransfer.setData("text/plain", column);
                                            // Identifies this drag as a column reorder while the
                                            // payload is still unreadable (see blockDndOwnership).
                                            e.dataTransfer.setData(COLUMN_DRAG_TYPE, column);
                                        }
                                        draggedColumnName = column;
                                    }}
                                >
                                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                                        <path d="M5 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm6-8a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0zm0 4a1 1 0 11-2 0 1 1 0 012 0z"/>
                                    </svg>
                                </div>
                            </div>
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
                    {@const logicalRowId = selectableRowId(row)}
                    <tr data-record-id={recordId ?? (source ? `${source.sourceKind}:${source.sourceId}` : undefined)}>
                        <th
                            class="selection-header row-header"
                            class:header-selected={logicalRowId !== undefined && rowSelected(logicalRowId)}
                            scope="row"
                            role="rowheader"
                            tabindex={logicalRowId === undefined ? undefined : 0}
                            aria-label={`Select row ${rowIndex + 1}`}
                            aria-selected={logicalRowId !== undefined ? rowSelected(logicalRowId) : undefined}
                            onclick={(event) => logicalRowId && selectRowHeader(event, logicalRowId)}
                            onkeydown={(event) => logicalRowId
                                && activateHeader(event, () => selectRowHeader(event, logicalRowId))}
                        >{rowIndex + 1}</th>
                        {#each displayColumns as column (column)}
                            {@const logicalCell = logicalRowId ? { rowId: logicalRowId, columnId: column } : undefined}
                            {@const schemaColumn = columnByName.get(column)}
                            {@const CellComponent = cellComponentFor(componentTypes[column], schemaColumn)}
                            <td
                                role="gridcell"
                                data-record-id={recordId}
                                data-row-id={logicalRowId}
                                data-col={column}
                                class:grid-selected={logicalCell !== undefined && cellSelected(logicalCell)}
                                class:grid-active={logicalCell !== undefined && cellActive(logicalCell)}
                                aria-selected={logicalCell !== undefined ? cellSelected(logicalCell) : undefined}
                                onclickcapture={(event) => {
                                    suppressSyntheticTouchClick(event);
                                    if (event.defaultPrevented) return;
                                    if (logicalCell) selectCell(event, logicalCell);
                                }}
                                onpointerdown={(event) => logicalCell && touchCellPointerDown(event, logicalCell)}
                                onpointermove={touchCellPointerMove}
                                onpointerup={touchCellPointerUp}
                                onpointercancel={() => {
                                    cancelLongPress();
                                    touchStart = undefined;
                                }}
                            >
                                <CellComponent
                                    value={row[column]}
                                    editable={editability.editable
                                    && (recordId !== undefined || source !== undefined)
                                    && editability.editableColumns.has(column)}
                                    options={schemaColumn?.checkOptions}
                                    ariaLabel={`${column} for ${recordId ?? source?.sourceId ?? "new row"}`}
                                    editSeed={logicalCell !== undefined && cellEditing(logicalCell) ? pendingEditSeed : undefined}
                                    bind:editing={
                                        () => logicalCell !== undefined && cellEditing(logicalCell),
                                        (editing) => {
                                            if (!logicalCell) return;
                                            if (editing) {
                                                selection.select(logicalCell);
                                                selectionRevision++;
                                                editingCell = logicalCell;
                                            } else if (cellEditing(logicalCell)) {
                                                editingCell = undefined;
                                                pendingEditSeed = undefined;
                                            }
                                        }
                                    }
                                    onCommit={(value) => {
                                        if (recordId !== undefined || source !== undefined) commitCell(row, column, value);
                                    }}
                                    onRequestFocus={(direction) => {
                                        if (logicalCell) exitCellEdit(logicalCell, direction);
                                    }}
                                />
                                {#if touchSelectionMode && logicalCell && isSelectionEnd(logicalCell, "anchor")}
                                    <button
                                        type="button"
                                        class="touch-selection-handle touch-selection-handle-start"
                                        aria-label="Resize selection from start"
                                        onpointerdown={(event) => startHandleDrag(event, "anchor")}
                                    ></button>
                                {/if}
                                {#if touchSelectionMode && logicalCell && isSelectionEnd(logicalCell, "focus")}
                                    <button
                                        type="button"
                                        class="touch-selection-handle touch-selection-handle-end"
                                        aria-label="Resize selection from end"
                                        onpointerdown={(event) => startHandleDrag(event, "focus")}
                                    ></button>
                                {/if}
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
        {#if touchSelectionMode}
            <div class="touch-selection-toolbar" role="toolbar" aria-label="Grid selection actions">
                <button
                    type="button"
                    aria-pressed={additiveTouchSelection}
                    onclick={() => additiveTouchSelection = !additiveTouchSelection}
                >{additiveTouchSelection ? "Add selection: on" : "Add selection"}</button>
                {#if activeSelectionCell()}
                    <button
                        type="button"
                        onclick={editActiveTouchCell}
                    >Edit cell</button>
                {/if}
                <button type="button" onclick={leaveTouchSelectionMode}>Done</button>
            </div>
        {/if}
    {:else if !schema}
        <p class="empty-state">
            {#if rowCreationMode === "table"}
                No schema applied. Apply a schema to see rows.
            {:else}
                No query result. Apply a schema and set a query to see rows.
            {/if}
        </p>
    {:else}
        <p class="empty-state">
            {#if rowCreationMode === "table"}
                The table is empty.
            {:else}
                The query returned no rows.
            {/if}
        </p>
    {/if}

    {#if !editability.editable && editability.readOnlyReason && result.columns.length > 0}
        <p class="readonly-reason" data-testid="grid-readonly-reason">{editability.readOnlyReason}</p>
    {/if}

    {#if (rowCreationMode === "table"
        ? !!schema && (!editability.readOnlyReason || editability.readOnlyReason === "Query result has no id column")
        : schema && editability.editable && editability.rowIdentity === "id") && showAddRowButton !== false}
        <button type="button" class="add-row" data-testid="yjs-table-add-row" onclick={addRow}>
            + Add row
        </button>
    {/if}

    <ConfirmDialog
        bind:isOpen={isConfirmDialogOpen}
        title="Delete row"
        message={bulkRowsToDelete
            ? `Are you sure you want to delete ${bulkRowsToDelete.length} selected row${bulkRowsToDelete.length === 1 ? "" : "s"}?`
            : rowToDelete
            ? `Are you sure you want to delete row ${rowToDelete}?`
            : "Are you sure you want to delete this row?"}
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
    overscroll-behavior-x: contain;
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

td.grid-selected {
    position: relative;
    background-color: rgb(37 99 235 / 12%);
}

td.grid-selected:not(.grid-active) {
    box-shadow: inset 0 0 0 1px rgb(37 99 235 / 35%);
}

.selection-header {
    width: 2.5rem;
    min-width: 2.5rem;
    text-align: center;
    cursor: pointer;
    user-select: none;
    color: #4b5563;
}

th.header-selected {
    background-color: #dbeafe;
    color: #1d4ed8;
    outline: 2px solid #2563eb;
    outline-offset: -2px;
}

tr:has(> .row-header.header-selected) > td.grid-selected,
table:has(.corner-header.header-selected) tbody td,
table:has(th[role="columnheader"].header-selected) td.grid-selected {
    background-color: rgb(14 116 144 / 14%);
}

td.grid-active {
    position: relative;
    background-color: rgb(37 99 235 / 18%);
    outline: 2px solid #2563eb;
    outline-offset: -2px;
    z-index: 1;
}

.touch-selection-handle {
    position: absolute;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: #2563eb;
    box-shadow: 0 0 0 3px white, 0 1px 4px rgb(0 0 0 / 35%);
    z-index: 4;
    touch-action: none;
}

.touch-selection-handle-start {
    top: -14px;
    left: -14px;
}

.touch-selection-handle-end {
    right: -14px;
    bottom: -14px;
}

.touch-selection-toolbar {
    position: sticky;
    left: 0;
    bottom: max(8px, env(safe-area-inset-bottom));
    z-index: 5;
    display: flex;
    width: max-content;
    gap: 6px;
    margin: 8px auto;
    padding: 6px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: white;
    box-shadow: 0 4px 16px rgb(15 23 42 / 20%);
}

.touch-selection-toolbar button {
    min-height: 44px;
    border: 0;
    border-radius: 999px;
    padding: 0 14px;
    background: #eff6ff;
    color: #1e3a8a;
    font: inherit;
}

.touch-selection-toolbar button[aria-pressed="true"] {
    background: #2563eb;
    color: white;
}

th {
    background-color: #f3f4f6;
    font-weight: 600;
}

th.drop-target-left {
    border-left: 3px solid #2563eb;
}

th.drop-target-right {
    border-right: 3px solid #2563eb;
}

.th-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.th-label {
    flex-grow: 1;
}

.column-drag-handle {
    cursor: grab;
    padding: 0 4px;
    color: #9ca3af;
    display: flex;
    align-items: center;
    user-select: none;
}

.column-drag-handle:active {
    cursor: grabbing;
}

.column-drag-handle:hover {
    color: #6b7280;
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
.loading-state,
.grid-selection-status {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 6px 0;
}
</style>
