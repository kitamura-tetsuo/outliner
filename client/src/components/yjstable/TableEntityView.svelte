<script lang="ts">
// The Table entity itself: schema + data, and nothing else.
//
// A Table is viewable and editable with zero Grids in the project (issue
// #5012). This view therefore never touches the Grid registry: the rows come
// from an implicit, ephemeral `SELECT * FROM <sqlName>` run by
// `RawTableQueryRunner`, and a column reorder made here stays in component
// state instead of being persisted as Grid presentation.
//
// Grid-owned concepts — a stored SELECT, labels, hidden columns, cell
// component settings, charts — belong to `YjsTableView` on /grids/... . What a
// Table page shows of them is a *link*, rendered by `TableGridReferences`.

import { onDestroy, onMount } from "svelte";
import * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { isForeignInput } from "../../lib/KeyEventHandler";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import type { ParsedTableSchema } from "../../services/yjstable/schemaIntrospection";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import {
    getTableName,
    getTableRegistry,
    getTableSqlName,
    listTables,
    type TableHandles,
} from "../../services/yjstable/tableDocs";
import { rawTableQuery, RawTableQueryRunner } from "../../services/yjstable/tableQueryRunner";
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
import { orderColumns } from "../../services/yjstable/columnOrder";
import TableGrid from "./TableGrid.svelte";
import TableSchemaEditor from "./TableSchemaEditor.svelte";

const logger = getLogger("TableEntityView");

interface Props {
    /** Handles for the Table this page is about (schema + data). */
    handles: TableHandles;
    /** Project doc holding the Table registry. */
    projectDoc: Y.Doc;
    /** Project id used to connect the subdoc to its room; undefined = local only. */
    projectId?: string;
}

let { handles, projectDoc, projectId }: Props = $props();

// --- $state mirrors (Yjs -> UI via adapter callbacks) ---
let schema = $state<ParsedTableSchema | undefined>(undefined);
let schemaError = $state<string | undefined>(undefined);
let result = $state<TableQueryResult>({ columns: [], rows: [] });
let queryError = $state<string | undefined>(undefined);
let recordErrors = $state<RecordSyncError[]>([]);
let adapterReady = $state(false);
let isInitialSyncDone = $state(false);

// The schema editor is opt-in so the page opens on the data, but the data
// panel itself is never hidden: it is what a Table page is for.
let showSchema = $state(false);

/**
 * Ephemeral column order. Reordering the raw browser rearranges this session's
 * view and is deliberately forgotten on reload — persisting it would make the
 * Table page carry Grid presentation state under another name.
 */
let columnOrder = $state<string[]>([]);

// Empty presentation maps: the raw browser shows every column of the Table in
// schema order, labelled by its SQL name. Grid presentation lives on a Grid.
const NO_COLUMN_SETTINGS: Record<string, string | undefined> = {};
const NO_HIDDEN_COLUMNS: Record<string, boolean> = {};

// The display name and the SQL name are read from the Table registry rather
// than taken as props: renaming a Table has to move the implicit query and its
// caption together, and the runner reads the same source (AGENTS.md §11).
let tableName = $state<string | undefined>(undefined);
let sqlName = $state<string | undefined>(undefined);
/** Provenance: set when this Table was copied in from another project. */
let sourceProjectId = $state<string | undefined>(undefined);

function refreshRegistryMirror() {
    tableName = getTableName(projectDoc, handles.tableId);
    sqlName = getTableSqlName(projectDoc, handles.tableId);
    sourceProjectId = listTables(projectDoc).find(t => t.tableId === handles.tableId)?.sourceProjectId;
}

const registryObserver = () => refreshRegistryMirror();

const rawQuery = $derived(rawTableQuery(sqlName ?? ""));

let adapter = $state<TableSyncAdapter | undefined>(undefined);
let runner: RawTableQueryRunner | undefined;

// What this view hands to the system clipboard when a copy crosses it.
const clipboardSource: TableClipboardSource = {
    getGrid: () => {
        if (result.columns.length === 0) return undefined;
        return {
            columns: orderColumns(result.columns, columnOrder),
            hiddenColumns: NO_HIDDEN_COLUMNS,
            labels: NO_COLUMN_SETTINGS,
            rows: result.rows,
        };
    },
    // A chart is a Grid-result presentation, so a Table page has none to copy.
    getChartImage: () => undefined,
};

// handles/projectDoc are static within the component lifecycle due to `{#key}`
// svelte-ignore state_referenced_locally
const session = createTableEngineSession({ projectDoc, projectId });
let unsubscribeAdapter: (() => void) | undefined;
let unsubscribeRunner: (() => void) | undefined;

onMount(() => {
    refreshRegistryMirror();
    getTableRegistry(projectDoc).observeDeep(registryObserver);
    registerTableClipboardSource(handles.tableId, clipboardSource);

    void (async () => {
        const acquired = await session.acquire(handles.tableId);
        if (!acquired) {
            logger.warn({ tableId: handles.tableId }, "[TableEntityView] table is not registered in this project");
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
        runner = new RawTableQueryRunner({
            sourceAdapter: acquired.adapter,
            projectDoc,
            tableId: handles.tableId,
        });
        unsubscribeRunner = runner.subscribe({
            onResult: (r) => {
                result = r;
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
    getTableRegistry(projectDoc).unobserveDeep(registryObserver);
    unsubscribeAdapter?.();
    unsubscribeRunner?.();
    runner?.dispose();
    unregisterTableClipboardSource(handles.tableId, clipboardSource);
    session.dispose();
    // The Table's undo manager is released by the page that resolved the
    // handles, matching how it was retained.
});
</script>

<div
    class="table-entity-view"
    data-testid="table-entity-view"
    data-table-id={handles.tableId}
    onfocusin={(e) => {
        if (isForeignInput(e.target)) {
            editorOverlayStore.clearCursorAndSelection("local", true);
        }
    }}
>
    <div class="view-toolbar">
        {#if tableName}
            <span class="table-name" data-testid="table-entity-name">{tableName}</span>
        {/if}
        {#if sqlName}
            <!-- The identifier queries use. Shown next to the label so the two
                 names are never confused for one another. -->
            <code class="table-sql-name" data-testid="table-entity-sql-name" title="Name to use in SQL queries">{sqlName}</code>
        {/if}
        {#if sourceProjectId}
            <span class="table-provenance" data-testid="table-entity-provenance">copied from project</span>
        {/if}
        <div class="view-toggles" role="group" aria-label="Table panels">
            <button
                type="button"
                class:active={showSchema}
                aria-pressed={showSchema}
                data-testid="table-entity-toggle-schema"
                onclick={() => {
                    showSchema = !showSchema;
                }}
            >Schema</button>
        </div>
    </div>

    {#if showSchema}
        <section class="panel" data-testid="table-entity-schema">
            {#if adapter}
                <TableSchemaEditor {handles} {adapter} {schemaError} />
            {:else}
                <p class="loading">Loading table...</p>
            {/if}
        </section>
    {/if}

    {#if queryError}
        <p class="error" data-testid="table-entity-query-error">{queryError}</p>
    {/if}

    {#if recordErrors.length > 0}
        <div class="record-errors" data-testid="table-entity-record-errors">
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

    <section class="panel" data-testid="table-entity-data">
        <p class="raw-query-note">
            All rows of this table —
            <code data-testid="table-raw-query">{rawQuery}</code>.
            Edits here write straight to the table.
        </p>
        {#if adapterReady}
            <TableGrid
                {handles}
                {schema}
                query={rawQuery}
                {result}
                componentTypes={NO_COLUMN_SETTINGS}
                {columnOrder}
                columnLabels={NO_COLUMN_SETTINGS}
                hiddenColumns={NO_HIDDEN_COLUMNS}
                rowCreationMode="table"
                onColumnOrderChange={(order) => {
                    columnOrder = order;
                }}
                loading={schema === undefined && !isInitialSyncDone}
                {session}
                confirmRowDelete={true}
            />
        {:else}
            <p class="loading">Loading table...</p>
        {/if}
    </section>
</div>

<style>
.table-entity-view {
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
    margin-left: auto;
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

.raw-query-note {
    margin: 0 0 6px;
    font-size: 0.75rem;
    color: #6b7280;
}

.raw-query-note code {
    font-family: ui-monospace, monospace;
    background: #f3f4f6;
    border-radius: 3px;
    padding: 1px 5px;
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
