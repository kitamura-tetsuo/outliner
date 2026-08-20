<script lang="ts">
// Orchestrates one Grid: owns the sync-adapter/query-runner lifecycle, keeps
// plain $state mirrors of the Yjs structures (AGENTS.md §11 mirror pattern),
// and lets the user switch/parallel-display the schema editor, Grid Definition
// editor, grid and chart.
//
// This component is always mounted under {#key} on both the Grid entry and
// the source Table's Y.Doc guid (see YjsTableBlock), so switching either one
// remounts everything — no rebinding logic in here.

import { onDestroy, onMount } from "svelte";
import * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { isForeignInput } from "../../lib/KeyEventHandler";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import { destroyTableUndoManager, type TableHandles } from "../../services/yjstable/tableDocs";
import {
    destroyGridUndoManager,
    getGridQuery,
    type GridHandles,
    readGridComponents,
    retainGridUndoManager,
} from "../../services/yjstable/gridDocs";
import { GridQueryRunner } from "../../services/yjstable/gridQueryRunner";
import { orderColumns } from "../../services/yjstable/columnOrder";
import {
    registerTableClipboardSource,
    type TableClipboardSource,
    unregisterTableClipboardSource,
} from "../../stores/tableClipboardRegistry";
import type {
    RecordSyncError,
    TableQueryResult,
    TableSyncAdapter,
} from "../../services/yjstable/tableSyncAdapter";
import TableChartPanel from "./TableChartPanel.svelte";
import TableGrid from "./TableGrid.svelte";
import TableSchemaEditor from "./TableSchemaEditor.svelte";
import TableUiDefEditor from "./TableUiDefEditor.svelte";
import TableSchedulePanel from "./TableSchedulePanel.svelte";
import { store } from "../../stores/store.svelte";
import { summarizeTableSchedules, type TableScheduleSummary } from "../../services/schedule/scheduleRuleService";

const logger = getLogger("YjsTableView");

interface Props {
    /** The Grid this view renders (query + column UI settings). */
    grid: GridHandles;
    /** Handles for the Grid's source Table (schema + data). */
    handles: TableHandles;
    /** Project doc holding both registries. */
    projectDoc: Y.Doc;
    /** Project id used to connect the subdoc to its room; undefined = local only. */
    projectId?: string;
    tableName?: string;
    /** Identifier queries use for this table, shown next to the display name. */
    sqlName?: string;
    /** Provenance info from whence this table was copied */
    sourceProjectId?: string;
}

let { grid, handles, projectDoc, projectId, tableName, sqlName, sourceProjectId }: Props = $props();

// --- $state mirrors (Yjs -> UI via adapter callbacks and observers) ---
let schema = $state<ParsedTableSchema | undefined>(undefined);
let schemaError = $state<string | undefined>(undefined);
let result = $state<TableQueryResult>({ columns: [], rows: [] });
let queryError = $state<string | undefined>(undefined);
let recordErrors = $state<RecordSyncError[]>([]);
let gridQuery = $state("");
let columnOrder = $state<string[]>([]);
let componentTypes = $state<Record<string, string | undefined>>({});
let columnLabels = $state<Record<string, string | undefined>>({});
let hiddenColumns = $state<Record<string, boolean>>({});
let adapterReady = $state(false);
let isInitialSyncDone = $state(false);

// View switching: panels can be toggled independently (parallel display).
let showSchema = $state(false);
let showUiDef = $state(false);
let showGrid = $state(true);
let showChart = $state(false);
let showSchedule = $state(false);

let scheduleSummary = $state<TableScheduleSummary>({ total: 0, hasEnabled: false });

let chartPanel = $state<TableChartPanel | undefined>(undefined);

// The adapter is owned by the engine, not by this component: several views of
// the same table share one materialization, and sibling tables pulled in by a
// cross-table query stay alive for as long as this session holds them.
let adapter = $state<TableSyncAdapter | undefined>(undefined);
let runner = $state<GridQueryRunner | undefined>(undefined);

function refreshGridMirror() {
    gridQuery = getGridQuery(grid);
    const order = grid.entry.get("columnOrder");
    columnOrder = Array.isArray(order)
        ? (order as string[])
        : order instanceof Y.Array
        ? (order.toArray() as string[])
        : [];
    const settings = readGridComponents(grid);
    componentTypes = settings.types;
    columnLabels = settings.labels;
    hiddenColumns = settings.hidden;
}

const gridMirrorObserver = () => refreshGridMirror();

// What this view hands to the system clipboard when a copy crosses its host
// item. The getters run at copy time, so they read whatever is on screen then.
const clipboardSource: TableClipboardSource = {
    getGrid: () => {
        if (result.columns.length === 0) return undefined;
        return {
            columns: orderColumns(result.columns, columnOrder),
            hiddenColumns,
            labels: columnLabels,
            rows: result.rows,
        };
    },
    getChartImage: () => (showChart ? chartPanel?.getImage() : undefined),
};

const scheduleObserver = () => {
    scheduleSummary = summarizeTableSchedules(store.project, handles.tableId);
};

// handles/projectDoc are static within the component lifecycle due to `{#key}`
// svelte-ignore state_referenced_locally
const session = createTableEngineSession({ projectDoc, projectId });
let unsubscribeAdapter: (() => void) | undefined;
let unsubscribeRunner: (() => void) | undefined;

onMount(() => {
    refreshGridMirror();
    // Claim a reference on the Grid's shared undo manager so a sibling view
    // bound to the same Grid keeps its manager when this one unmounts.
    retainGridUndoManager(grid.entry);
    grid.entry.observeDeep(gridMirrorObserver);
    projectDoc.getMap("schedules").observeDeep(scheduleObserver);
    scheduleObserver();
    registerTableClipboardSource(handles.tableId, clipboardSource);

    void (async () => {
        const acquired = await session.acquire(handles.tableId);
        if (!acquired) {
            logger.warn({ tableId: handles.tableId }, "[YjsTableView] table is not registered in this project");
            return;
        }
        adapter = acquired.adapter;
        isInitialSyncDone = acquired.remoteSynced;
        unsubscribeAdapter = acquired.adapter.subscribe({
            onSchemaChanged: (parsed, error) => {
                schema = parsed;
                schemaError = error;
            },
            onRecordErrors: (errors) => {
                recordErrors = errors;
            },
        });
        runner = new GridQueryRunner({ grid, sourceAdapter: acquired.adapter });
        unsubscribeRunner = runner.subscribe({
            onResult: (r) => {
                result = r;
                chartPanel?.update(r);
            },
            onError: (message) => {
                queryError = message;
            },
        });
        runner.start();
        adapterReady = true;
    })();
});

onDestroy(() => {
    grid.entry.unobserveDeep(gridMirrorObserver);
    projectDoc.getMap("schedules").unobserveDeep(scheduleObserver);
    unsubscribeAdapter?.();
    unsubscribeRunner?.();
    runner?.dispose();
    unregisterTableClipboardSource(handles.tableId, clipboardSource);
    session.dispose();
    destroyTableUndoManager(handles.doc);
    destroyGridUndoManager(grid.entry);
});
</script>

<div
    class="yjs-table-view"
    data-testid="yjs-table-view"
    data-grid-id={grid.gridId}
    data-source-table-id={handles.tableId}
    onfocusin={(e) => {
        if (isForeignInput(e.target)) {
            editorOverlayStore.clearCursorAndSelection("local", true);
        }
    }}
>
    <div class="view-toolbar">
        {#if tableName}
            <span class="table-name" data-testid="yjs-table-name">{tableName}</span>
        {/if}
        {#if sqlName}
            <!-- The identifier queries use. Shown next to the label so the two
                 names are never confused for one another. -->
            <code class="table-sql-name" data-testid="yjs-table-sql-name" title="Name to use in SQL queries">{sqlName}</code>
        {/if}
        {#if sourceProjectId}
            <span class="table-provenance" data-testid="yjs-table-provenance">copied from project</span>
        {/if}
        <div class="view-toggles" role="group" aria-label="Table views">
            <button
                type="button"
                class:active={showGrid}
                aria-pressed={showGrid}
                data-testid="yjs-table-toggle-grid"
                onclick={() => {
                    showGrid = !showGrid;
                }}
            >Grid</button>
            <button
                type="button"
                class:active={showChart}
                aria-pressed={showChart}
                data-testid="yjs-table-toggle-chart"
                onclick={() => {
                    showChart = !showChart;
                }}
            >Chart</button>
            <button
                type="button"
                class:active={showSchema}
                aria-pressed={showSchema}
                data-testid="yjs-table-toggle-schema"
                onclick={() => {
                    showSchema = !showSchema;
                }}
            >Schema</button>
            <button
                type="button"
                class:active={showUiDef}
                aria-pressed={showUiDef}
                data-testid="yjs-table-toggle-ui"
                onclick={() => {
                    showUiDef = !showUiDef;
                }}
            >UI</button>
            <button
                type="button"
                class:active={showSchedule}
                aria-pressed={showSchedule}
                data-testid="yjs-table-toggle-schedule"
                title={scheduleSummary.total === 0 ? "Schedule" : (scheduleSummary.hasEnabled ? `Schedule (${scheduleSummary.total} rule${scheduleSummary.total === 1 ? "" : "s"}, active)` : `Schedule (${scheduleSummary.total} rule${scheduleSummary.total === 1 ? "" : "s"}, all disabled)`)}
                aria-label={scheduleSummary.total === 0 ? "Schedule" : (scheduleSummary.hasEnabled ? `Schedule (${scheduleSummary.total} rule${scheduleSummary.total === 1 ? "" : "s"}, active)` : `Schedule (${scheduleSummary.total} rule${scheduleSummary.total === 1 ? "" : "s"}, all disabled)`)}
                onclick={() => {
                    showSchedule = !showSchedule;
                }}
            >
                {#if scheduleSummary.total > 0}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        width="14"
                        height="14"
                        class:schedule-icon-disabled={!scheduleSummary.hasEnabled}
                        data-testid="yjs-table-schedule-indicator"
                        data-schedule-state={scheduleSummary.hasEnabled ? "enabled" : "disabled"}
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                {/if}
                Schedule
            </button>
        </div>
    </div>

    {#if showSchema}
        <section class="panel">
            {#if adapter}
                <TableSchemaEditor {handles} {adapter} {schemaError} />
            {:else}
                <p class="loading">Loading table...</p>
            {/if}
        </section>
    {/if}

    {#if showUiDef}
        <section class="panel">
            <TableUiDefEditor
                {grid}
                {schema}
                query={gridQuery}
                {componentTypes}
                {columnLabels}
                {hiddenColumns}
                resultColumns={result.columns}
                {columnOrder}
            />
        </section>
    {/if}

    {#if showSchedule}
        <section class="panel">
            <TableSchedulePanel tableId={handles.tableId} projectId={projectId || ''} />
        </section>
    {/if}

    {#if queryError}
        <p class="error" data-testid="yjs-table-query-error">{queryError}</p>
    {/if}

    {#if recordErrors.length > 0}
        <div class="record-errors" data-testid="yjs-table-record-errors">
            <p class="error-title">Some records could not be synchronized:</p>
            <ul>
                {#each recordErrors as error (`${error.recordId}:${error.column ?? ""}`)}
                    <li>
                        Record <code>{error.recordId}</code>
                        {#if error.column}(column <code>{error.column}</code>){/if}: {error.message}
                    </li>
                {/each}
            </ul>
        </div>
    {/if}

    {#if showGrid}
        <section class="panel">
            {#if adapterReady}
                <TableGrid
                    {grid}
                    {handles}
                    {schema}
                    query={gridQuery}
                    {result}
                    {componentTypes}
                    {columnOrder}
                    {columnLabels}
                    {hiddenColumns}
                    loading={schema === undefined && !isInitialSyncDone}
                    {session}
                />
            {:else}
                <p class="loading">Loading table...</p>
            {/if}
        </section>
    {/if}

    {#if showChart}
        <section class="panel">
            <TableChartPanel bind:this={chartPanel} initial={result} />
        </section>
    {/if}
</div>

<style>
    .schedule-icon-disabled {
        opacity: 0.35;
    }
.yjs-table-view {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
}

.view-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.table-name {
    font-weight: 600;
    color: #111827;
}

.table-sql-name {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    color: #4b5563;
    background: #f3f4f6;
    border-radius: 3px;
    padding: 1px 5px;
}

.table-provenance {
    font-size: 0.75rem;
    color: #6b7280;
}

.view-toggles {
    display: flex;
    gap: 4px;
}

.view-toggles button {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: white;
    padding: 2px 10px;
    cursor: pointer;
    font-size: 0.8rem;
}

.view-toggles button.active {
    background: #2563eb;
    border-color: #2563eb;
    color: white;
}

.panel {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 8px;
    background: #fafafa;
}

.error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0;
}

.record-errors {
    border: 1px solid #fca5a5;
    background: #fef2f2;
    border-radius: 4px;
    padding: 8px;
    font-size: 0.8rem;
}

.error-title {
    font-weight: 600;
    color: #dc2626;
    margin: 0 0 4px;
}

.record-errors ul {
    margin: 0;
    padding-left: 18px;
}

.loading {
    color: #6b7280;
    font-size: 0.85rem;
}
</style>
