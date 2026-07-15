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
import { connectTableDoc } from "../../lib/yjs/connection";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import {
    type RecordSyncError,
    type TableQueryResult,
    TableSyncAdapter,
} from "../../services/yjstable/tableSyncAdapter";
import TableChartPanel from "./TableChartPanel.svelte";
import TableGrid from "./TableGrid.svelte";
import TableSchemaEditor from "./TableSchemaEditor.svelte";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

const logger = getLogger("YjsTableView");

interface Props {
    handles: TableHandles;
    /** Project id used to connect the subdoc to its room; undefined = local only. */
    projectId?: string;
    tableName?: string;
}

let { handles, projectId, tableName }: Props = $props();

// --- $state mirrors (Yjs -> UI via adapter callbacks and observers) ---
let schema = $state<ParsedTableSchema | undefined>(undefined);
let schemaError = $state<string | undefined>(undefined);
let result = $state<TableQueryResult>({ columns: [], rows: [] });
let queryError = $state<string | undefined>(undefined);
let recordErrors = $state<RecordSyncError[]>([]);
let uiQuery = $state("");
let componentTypes = $state<Record<string, string | undefined>>({});
let adapterReady = $state(false);

// View switching: panels can be toggled independently (parallel display).
let showSchema = $state(false);
let showUiDef = $state(false);
let showGrid = $state(true);
let showChart = $state(false);

let chartPanel = $state<TableChartPanel | undefined>(undefined);

// handles is static within the component lifecycle due to `{#key}` wrapping
// svelte-ignore state_referenced_locally
const adapter = new TableSyncAdapter(handles, {
    onSchemaChanged: (parsed, error) => {
        schema = parsed;
        schemaError = error;
    },
    onQueryResult: (r) => {
        result = r;
        chartPanel?.update(r);
    },
    onQueryError: (message) => {
        queryError = message;
    },
    onRecordErrors: (errors) => {
        recordErrors = errors;
    },
});

function refreshUiMirror() {
    uiQuery = String(handles.uiDef.get("query") ?? "");
    const components = handles.uiDef.get("components");
    const next: Record<string, string | undefined> = {};
    if (components instanceof Y.Map) {
        components.forEach((cfg, column) => {
            next[column] = cfg instanceof Y.Map ? (cfg.get("type") as string | undefined) : undefined;
        });
    }
    componentTypes = next;
}

const uiMirrorObserver = () => refreshUiMirror();

let disposeConnection: (() => void) | undefined;

onMount(() => {
    refreshUiMirror();
    handles.uiDef.observeDeep(uiMirrorObserver);

    void (async () => {
        if (projectId) {
            try {
                const connection = await connectTableDoc(projectId, handles.tableId, handles.doc);
                disposeConnection = connection.dispose;
                // Seed PGlite only after the initial sync so we do not build
                // the table from a half-loaded document.
                await connection.waitForInitialSync(10000).catch(() => ({ synced: false }));
            } catch (err) {
                logger.warn({ err }, "[YjsTableView] table doc connection failed; continuing offline");
            }
        }
        await adapter.start();
        adapterReady = true;
    })();
});

onDestroy(() => {
    handles.uiDef.unobserveDeep(uiMirrorObserver);
    adapter.dispose();
    try {
        disposeConnection?.();
    } catch {
        // provider already gone
    }
});
</script>

<div class="yjs-table-view" data-testid="yjs-table-view">
    <div class="view-toolbar">
        {#if tableName}
            <span class="table-name" data-testid="yjs-table-name">{tableName}</span>
        {/if}
        <div class="view-toggles" role="group" aria-label="Table views">
            <button
                type="button"
                class:active={showGrid}
                data-testid="yjs-table-toggle-grid"
                onclick={() => {
                    showGrid = !showGrid;
                }}
            >Grid</button>
            <button
                type="button"
                class:active={showChart}
                data-testid="yjs-table-toggle-chart"
                onclick={() => {
                    showChart = !showChart;
                }}
            >Chart</button>
            <button
                type="button"
                class:active={showSchema}
                data-testid="yjs-table-toggle-schema"
                onclick={() => {
                    showSchema = !showSchema;
                }}
            >Schema</button>
            <button
                type="button"
                class:active={showUiDef}
                data-testid="yjs-table-toggle-ui"
                onclick={() => {
                    showUiDef = !showUiDef;
                }}
            >UI</button>
        </div>
        <div class="undo-controls">
            <button type="button" aria-label="Undo" onclick={() => handles.undo.undo()}>Undo</button>
            <button type="button" aria-label="Redo" onclick={() => handles.undo.redo()}>Redo</button>
        </div>
    </div>

    {#if showSchema}
        <section class="panel">
            <TableSchemaEditor {handles} {adapter} {schemaError} />
        </section>
    {/if}

    {#if showUiDef}
        <section class="panel">
            <TableUiDefEditor {handles} {schema} query={uiQuery} {componentTypes} />
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
                <TableGrid {handles} {schema} query={uiQuery} {result} {componentTypes} />
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
