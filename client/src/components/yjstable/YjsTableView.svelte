<script lang="ts">
// Orchestrates one table subdoc: owns the sync adapter lifecycle, keeps
// plain $state mirrors of the Yjs structures (AGENTS.md §11 mirror pattern),
// and lets the user switch/parallel-display the schema editor, UI Definition
// editor, grid and chart.
//
// This component is always mounted under {#key doc.guid} (see YjsTableBlock),
// so a Y.Doc switch remounts everything — no rebinding logic in here.

import { onDestroy, onMount } from "svelte";
import * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { isForeignInput } from "../../lib/KeyEventHandler";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import { destroyTableUndoManager, type TableHandles } from "../../services/yjstable/tableDocs";
import { globalUndoRouter } from "../../services/undo/undoRouter";
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

const logger = getLogger("YjsTableView");

interface Props {
    handles: TableHandles;
    /** Project doc holding the table registry (name lookups, conflict checks). */
    projectDoc: Y.Doc;
    /** Project id used to connect the subdoc to its room; undefined = local only. */
    projectId?: string;
    tableName?: string;
    /** Identifier queries use for this table, shown next to the display name. */
    sqlName?: string;
}

let { handles, projectDoc, projectId, tableName, sqlName }: Props = $props();

// --- $state mirrors (Yjs -> UI via adapter callbacks and observers) ---
let schema = $state<ParsedTableSchema | undefined>(undefined);
let schemaError = $state<string | undefined>(undefined);
let result = $state<TableQueryResult>({ columns: [], rows: [] });
let queryError = $state<string | undefined>(undefined);
let recordErrors = $state<RecordSyncError[]>([]);
let uiQuery = $state("");
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

let chartPanel = $state<TableChartPanel | undefined>(undefined);

// The adapter is owned by the engine, not by this component: several views of
// the same table share one materialization, and sibling tables pulled in by a
// cross-table query stay alive for as long as this session holds them.
let adapter = $state<TableSyncAdapter | undefined>(undefined);

const engineCallbacks = {
    onSchemaChanged: (parsed: ParsedTableSchema | undefined, error?: string) => {
        schema = parsed;
        schemaError = error;
    },
    onQueryResult: (r: TableQueryResult) => {
        result = r;
        chartPanel?.update(r);
    },
    onQueryError: (message: string | undefined) => {
        queryError = message;
    },
    onRecordErrors: (errors: RecordSyncError[]) => {
        recordErrors = errors;
    },
};

function refreshUiMirror() {
    uiQuery = String(handles.uiDef.get("query") ?? "");
    const order = handles.uiDef.get("columnOrder");
    columnOrder = order instanceof Y.Array ? (order.toArray() as string[]) : [];
    const components = handles.uiDef.get("components");
    const nextType: Record<string, string | undefined> = {};
    const nextLabel: Record<string, string | undefined> = {};
    const nextHidden: Record<string, boolean> = {};
    if (components instanceof Y.Map) {
        components.forEach((cfg, column) => {
            if (cfg instanceof Y.Map) {
                nextType[column] = cfg.get("type") as string | undefined;
                nextLabel[column] = cfg.get("label") as string | undefined;
                if (cfg.get("hidden") === true) nextHidden[column] = true;
            }
        });
    }
    componentTypes = nextType;
    columnLabels = nextLabel;
    hiddenColumns = nextHidden;
}

const uiMirrorObserver = () => refreshUiMirror();

// handles/projectDoc are static within the component lifecycle due to `{#key}`
// svelte-ignore state_referenced_locally
const session = createTableEngineSession({ projectDoc, projectId });
let unsubscribe: (() => void) | undefined;

onMount(() => {
    refreshUiMirror();
    handles.uiDef.observeDeep(uiMirrorObserver);

    void (async () => {
        const acquired = await session.acquire(handles.tableId);
        if (!acquired) {
            logger.warn({ tableId: handles.tableId }, "[YjsTableView] table is not registered in this project");
            return;
        }
        adapter = acquired.adapter;
        isInitialSyncDone = acquired.remoteSynced;
        unsubscribe = acquired.adapter.subscribe(engineCallbacks);
        adapterReady = true;
    })();
});

onDestroy(() => {
    handles.uiDef.unobserveDeep(uiMirrorObserver);
    unsubscribe?.();
    session.dispose();
    destroyTableUndoManager(handles.doc);
});
</script>

<div
    class="yjs-table-view"
    data-testid="yjs-table-view"
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
                onclick={() => {
                    showSchedule = !showSchedule;
                }}
            >Schedule</button>
        </div>
        <div class="undo-controls">
            <!-- Undo/redo always go through the global router, never through
                 this table's own Y.UndoManager: a direct call would advance the
                 scope's stack without the router's and desynchronize them. -->
            <button
                type="button"
                data-testid="yjs-table-undo"
                onclick={() => globalUndoRouter.undo()}
            >Undo</button>
            <button
                type="button"
                data-testid="yjs-table-redo"
                onclick={() => globalUndoRouter.redo()}
            >Redo</button>
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
            <TableUiDefEditor {handles} {schema} query={uiQuery} {componentTypes} {columnLabels} {hiddenColumns} {columnOrder} />
        </section>
    {/if}

    {#if showSchedule}
        <section class="panel">
            <TableSchedulePanel tableId={handles.tableId} />
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
                    {handles}
                    {schema}
                    query={uiQuery}
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

.view-toggles,
.undo-controls {
    display: flex;
    gap: 4px;
}

.view-toggles button,
.undo-controls button {
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
