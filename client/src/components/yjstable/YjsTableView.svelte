<script lang="ts">
// One Grid lifetime, independent of the Y.Docs of its SQL suppliers.
import { resolve } from "$app/paths";
import { onDestroy, onMount, tick } from "svelte";
import * as Y from "yjs";
import { isForeignInput } from "../../lib/KeyEventHandler";
import { projectTablePath } from "../../lib/managementPaths";
import { registerWebMCPGridTools } from "../../mcp/WebMCP";
import { globalUndoRouter } from "../../services/undo/undoRouter.svelte";
import { orderColumns } from "../../services/yjstable/columnOrder";
import {
    getGridConfirmRowDelete,
    getGridQuery,
    getGridRegistry,
    getGridShowAddRowButton,
    type GridHandles,
    readGridComponents,
} from "../../services/yjstable/gridDocs";
import { createGridExistingRowMutationBoundary } from "../../services/yjstable/gridExistingRowMutation";
import { createGridInsertController, type GridInsertOutcome } from "../../services/yjstable/gridInsertController";
import { createGridMetadataResolver, type GridMetadataResolution } from "../../services/yjstable/gridMetadataResolver";
import { buildGridRenderTrace } from "../../services/yjstable/gridRenderTrace";
import { registerGridRenderTraceSource } from "../../services/yjstable/gridRenderTraceRegistry";
import {
    analyzeProjectQueryProvenance,
    type ProjectQueryProvenance,
} from "../../services/yjstable/projectQueryProvenance";
import {
    createProjectSelectSession,
    type ProjectSelectEvidence,
    type ProjectSelectState,
} from "../../services/yjstable/projectSelectSession";
import type { ParsedTableSchema, TableColumnSchema } from "../../services/yjstable/schemaIntrospection";
import { listTables } from "../../services/yjstable/tableDocs";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import type { TableQueryExecution } from "../../services/yjstable/tableQueryRunner";
import type { TableQueryResult } from "../../services/yjstable/tableSyncAdapter";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import {
    registerTableClipboardSource,
    type TableClipboardSource,
    unregisterTableClipboardSource,
} from "../../stores/tableClipboardRegistry";
import TableChartPanel from "./TableChartPanel.svelte";
import TableGrid from "./TableGrid.svelte";
import TableUiDefEditor from "./TableUiDefEditor.svelte";

interface Props {
    grid: GridHandles;
    projectDoc: Y.Doc;
    projectId?: string;
    projectName?: string;
    placementId?: string;
    pageId?: string;
    pageTitle?: string;
    isReadOnly?: boolean;
    canWrite?: () => boolean;
}
let { grid, projectDoc, projectId, projectName, placementId, pageId, pageTitle, isReadOnly = false, canWrite }: Props =
    $props();
// The parent keys by Grid/Project identity; suppliers do not remount this view.
// svelte-ignore state_referenced_locally
const mountedGrid = grid;
let gridName = $state("");
let result = $state.raw<TableQueryResult>({ columns: [], rows: [] });
let queryError = $state<string | undefined>();
let gridQuery = $state("");
let columnOrder = $state<string[]>([]);
let componentTypes = $state<Record<string, string | undefined>>({});
let columnLabels = $state<Record<string, string | undefined>>({});
let hiddenColumns = $state<Record<string, boolean>>({});
let columnWidths = $state<Record<string, number>>({});
let widthPreview = $state<{ column: string; width: number; } | undefined>();
let showAddRowButton = $state(true);
let confirmRowDelete = $state(false);
let queryExecution = $state<TableQueryExecution | undefined>();
let insertOutcome = $state<GridInsertOutcome | undefined>();
let displayMetadata = $state.raw<GridMetadataResolution | undefined>();
let guardedAuthority = $state.raw<
    | { evidence: ProjectSelectEvidence; provenance: ProjectQueryProvenance; metadata: GridMetadataResolution; }
    | undefined
>();
let selectState = $state.raw<ProjectSelectState>({ status: "loading" });
let clientRevision = $state(0);
let publication = 0;
let destroyed = false;
let showUiDef = $state(false);
let showGrid = $state(true);
let showChart = $state(false);
let chartPanel = $state<TableChartPanel | undefined>();
const mutationIncarnation = $derived(
    guardedAuthority
        ? `${guardedAuthority.metadata.evidenceFingerprint}:${clientRevision}`
        : `unavailable:${clientRevision}`,
);
const dependencies = $derived(selectState.status === "success" ? selectState.evidence.sources : undefined);
const sqlName = $derived(dependencies?.length === 1 ? dependencies[0].sqlName : undefined);
const sourceId = $derived(
    dependencies?.length === 1 && dependencies[0].kind === "table" ? dependencies[0].id : undefined,
);

// Result metadata describes presentation only; the mutation boundary separately
// proves each physical source/field and checks provider permissions.
function resultField(name: string, typeId?: number): TableColumnSchema {
    const kind = typeId === 16 ? "boolean" : [20, 21, 23].includes(typeId ?? 0)
        ? "integer"
        : [700, 701, 1700].includes(typeId ?? 0)
        ? "number"
        : typeId === 1082
        ? "date"
        : "text";
    return { name, kind, dataType: kind, isNullable: true, isPrimaryKey: false };
}
const schema = $derived<ParsedTableSchema | undefined>(
    displayMetadata
        ? {
            tableName: "",
            createSql: "",
            columns: displayMetadata.columns.map(column => {
                const fields = displayMetadata!.physicalColumns.filter(field => field.outputColumn === column.name);
                return fields.length === 1 && fields[0].field
                    ? { ...fields[0].field, name: column.name }
                    : resultField(column.name, column.typeId);
            }),
        }
        : undefined,
);
const bareIdAuthority = $derived(
    guardedAuthority?.provenance.status === "proven" && guardedAuthority.metadata.status === "resolved"
        && (guardedAuthority.provenance.bareIdSource
            || (result.columns.includes("source_kind") && result.columns.includes("source_id")))
        ? {
            status: "compatible" as const,
            editableColumns: new Set(
                guardedAuthority.metadata.physicalColumns.filter(column =>
                    column.field && column.physicalColumn !== "id"
                    && !["id", "source_kind", "source_id"].includes(column.outputColumn)
                ).map(column => column.outputColumn),
            ),
        }
        : {
            status: "unavailable" as const,
            editableColumns: new Set<string>(),
            reason: guardedAuthority?.metadata.reason ?? (guardedAuthority
                ? "Read-only view: result rows do not identify one physical source"
                : "Current query source evidence is unavailable"),
        },
);

// These producer sessions own their provider holds. No supplier is chosen as a
// renderer, schema authority, or fallback write destination.
// svelte-ignore state_referenced_locally
const session = createTableEngineSession({ projectDoc, projectId });
// svelte-ignore state_referenced_locally
const guardedSelect = createProjectSelectSession({
    projectDoc,
    projectId,
    query: getGridQuery(mountedGrid),
    requireExplicitAliases: mountedGrid.entry.get("sqlAliasPolicyVersion") === 1,
});
// svelte-ignore state_referenced_locally
const guardedMetadataResolver = createGridMetadataResolver({ projectDoc, projectId });
// svelte-ignore state_referenced_locally
const mutationBoundary = createGridExistingRowMutationBoundary({
    projectDoc,
    projectId,
    session: guardedSelect,
    evidence: () => guardedAuthority?.evidence,
    provenance: () => guardedAuthority?.provenance,
    metadata: () => guardedAuthority?.metadata,
    canWrite: () => getGridRegistry(projectDoc).get(mountedGrid.gridId) === mountedGrid.entry
        && !isReadOnly && (canWrite?.() ?? true),
    allows: () => !isReadOnly && (canWrite?.() ?? true),
    relationSession: session,
    onBeforeEffects: () => globalUndoRouter.stopCapturing(),
});
// svelte-ignore state_referenced_locally
const insertController = createGridInsertController({
    projectDoc,
    projectId,
    gridEntry: mountedGrid.entry,
    query: getGridQuery(mountedGrid),
    canWrite: () => getGridRegistry(projectDoc).get(mountedGrid.gridId) === mountedGrid.entry
        && !isReadOnly && (canWrite?.() ?? true),
    onBeforeEffects: () => globalUndoRouter.stopCapturing(),
});

function refreshGridMirror() {
    gridName = String(mountedGrid.entry.get("name") ?? "Grid");
    gridQuery = getGridQuery(mountedGrid);
    const order = mountedGrid.entry.get("columnOrder");
    columnOrder = Array.isArray(order) ? order : order instanceof Y.Array ? order.toArray() : [];
    const settings = readGridComponents(mountedGrid);
    componentTypes = settings.types;
    columnLabels = settings.labels;
    hiddenColumns = settings.hidden;
    columnWidths = settings.widths;
    showAddRowButton = getGridShowAddRowButton(mountedGrid);
    confirmRowDelete = getGridConfirmRowDelete(mountedGrid);
    guardedSelect.setQuery(gridQuery);
    insertController.setQuery(gridQuery);
}
const gridMirrorObserver = () => refreshGridMirror();
async function publish(next: ProjectSelectState) {
    const request = ++publication;
    selectState = next.status === "success" ? { status: "loading" } : next;
    guardedAuthority = undefined;
    queryExecution = undefined;
    clientRevision++;
    queryError = next.status === "error" || next.status === "unavailable" ? next.message : undefined;
    if (next.status !== "success") return;
    const evidence = next.evidence;
    const provenance = analyzeProjectQueryProvenance(evidence);
    const metadata = await guardedMetadataResolver.resolve(evidence, provenance, guardedSelect);
    if (destroyed || request !== publication || !guardedSelect.isEvidenceCurrent(evidence)) return;
    // Publish one coherent incarnation. Retained rows during loading never
    // acquire current authority until their own metadata has completed.
    result = { columns: evidence.columns.map(column => column.name), rows: evidence.rows };
    displayMetadata = metadata;
    selectState = next;
    guardedAuthority = { evidence, provenance, metadata };
    queryExecution = {
        queryId: `${evidence.queryId}:${evidence.executionGeneration}`,
        generation: evidence.executionGeneration,
        query: evidence.query.trim(),
        status: "completed",
        startedAt: new Date().toISOString(),
        durationMs: 0,
        rowCount: evidence.rows.length,
        columnCount: evidence.columns.length,
    };
    chartPanel?.update(result);
}
async function refreshAfterGuardedEffects() {
    await guardedSelect.runNow();
}
const clipboardSource: TableClipboardSource = {
    getGrid: () =>
        result.columns.length
            ? {
                columns: orderColumns(result.columns, columnOrder),
                hiddenColumns,
                labels: columnLabels,
                rows: result.rows,
            }
            : undefined,
    getChartImage: () => showChart ? chartPanel?.getImage() : undefined,
};
function getGridRenderTrace() {
    return buildGridRenderTrace({
        gridId: mountedGrid.gridId,
        sourceTableId: sourceId ?? "",
        projectId,
        projectDocumentId: projectDoc.guid,
        tableDocumentId: "",
        configRevision: Array.from(Y.encodeStateVector(projectDoc), byte => byte.toString(16).padStart(2, "0")).join(
            "",
        ),
        clientRevision,
        query: gridQuery,
        result,
        execution: queryExecution,
        columnOrder,
        hiddenColumns,
    });
}
let unsubscribe: (() => void) | undefined;
let cleanupWebMCP: (() => void) | undefined;
let unregisterTrace: (() => void) | undefined;
onMount(() => {
    refreshGridMirror();
    mountedGrid.entry.observeDeep(gridMirrorObserver);
    registerTableClipboardSource(mountedGrid.gridId, clipboardSource);
    unsubscribe = guardedSelect.subscribe(next => void publish(next));
    cleanupWebMCP = registerWebMCPGridTools(
        () => ({ gridId: mountedGrid.gridId, sourceTableId: sourceId ?? "", query: gridQuery }),
        () => ({
            gridId: mountedGrid.gridId,
            sourceTableId: sourceId ?? "",
            rows: result.rows,
            columns: result.columns,
            rowCount: result.rows.length,
        }),
        getGridRenderTrace,
    );
    unregisterTrace = registerGridRenderTraceSource(mountedGrid.gridId, getGridRenderTrace);
});
onDestroy(() => {
    destroyed = true;
    publication++;
    unsubscribe?.();
    mountedGrid.entry.unobserveDeep(gridMirrorObserver);
    unregisterTableClipboardSource(mountedGrid.gridId, clipboardSource);
    mutationBoundary.dispose();
    guardedMetadataResolver.dispose();
    guardedSelect.dispose();
    session.dispose();
    insertController.dispose();
    cleanupWebMCP?.();
    unregisterTrace?.();
});
</script>

<div
    class="yjs-table-view"
    data-testid="yjs-table-view"
    data-grid-id={grid.gridId}
    data-source-table-id={sourceId}
    data-mutation-incarnation={mutationIncarnation}
    data-ui-editor-open={showUiDef}
    onfocusin={(e) => {
        if (isForeignInput(e.target)) {
            editorOverlayStore.clearCursorAndSelection("local", true);
        }
    }}
>
    <div class="view-toolbar">
        <span class="table-name" data-testid="yjs-table-name">{gridName}</span>
        {#if sqlName}<code class="table-sql-name" data-testid="yjs-table-sql-name">{sqlName}</code>{/if}
        <div data-testid="grid-query-dependencies">
            {#if dependencies === undefined}
                <span>SQL dependencies unavailable</span>
            {:else if dependencies.length === 0}
                <span>No project Table dependencies</span>
            {:else}
                {#each dependencies as source (`${source.kind}:${source.id}`)}
                    {#if source.kind === "table" && projectName}
                        <a class="source-table-link" data-testid="yjs-grid-source-table-link" href={resolve(projectTablePath(projectName, source.id))}>
                            {listTables(projectDoc).find(table => table.tableId === source.id)?.name || source.sqlName}
                        </a>
                    {:else}<span>{source.sqlName} ({source.kind})</span>{/if}
                {/each}
            {/if}
        </div>
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
                onclick={async () => {
                    showChart = !showChart;
                    if (showChart) {
                        await tick();
                        chartPanel?.update(result);
                    }
                }}
            >Chart</button>
            <button
                type="button"
                class:active={showUiDef}
                aria-pressed={showUiDef}
                data-testid="yjs-table-toggle-ui"
                onclick={() => {
                    showUiDef = !showUiDef;
                }}
            >UI</button>
        </div>
    </div>

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
                {showAddRowButton}
                {confirmRowDelete}
                {columnWidths}
                {widthPreview}
                {isReadOnly}
            />
        </section>
    {/if}

    {#if queryError}
        <p class="error" data-testid="yjs-table-query-error">{queryError}</p>
    {/if}

    {#if showGrid}
        <section class="panel">
                <TableGrid
                    {grid}
                    {placementId}
                    {pageId}
                    {pageTitle}
                    {schema}
                    query={gridQuery}
                    {result}
                    {bareIdAuthority}
                    {componentTypes}
                    {columnOrder}
                    {columnLabels}
                    {hiddenColumns}
                    {columnWidths}
                    {showAddRowButton}
                    {confirmRowDelete}
                    loading={displayMetadata === undefined && selectState.status === "loading"}
                    {session}
                    {mutationBoundary}
                    {mutationIncarnation}
                    mutationPhysicalColumns={displayMetadata?.physicalColumns}
                    resultColumnMetadata={displayMetadata?.columns}
                    onGuardedEffects={refreshAfterGuardedEffects}
                    {isReadOnly}
                    onAddRow={async () => {
                        insertOutcome = await insertController.submit();
                    }}
                    onColumnWidthPreview={(preview) => {
                        widthPreview = preview;
                    }}
                />
                {#if insertOutcome}
                    <p
                        class:error={insertOutcome.status !== "inserted"}
                        data-testid="yjs-grid-insert-status"
                        role="status"
                    >{insertOutcome.status === "inserted"
                        ? `Added row to ${insertOutcome.targetSqlName}`
                        : insertOutcome.message}</p>
                {/if}
        </section>
    {/if}

    {#if showChart}
        <section class="panel">
            {#key result}
                <TableChartPanel bind:this={chartPanel} initial={result} />
            {/key}
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

.source-table-link {
    font-size: 0.8rem;
    color: #2563eb;
    text-decoration: underline;
}

.table-sql-name {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    color: #4b5563;
    background: #f3f4f6;
    border-radius: 3px;
    padding: 1px 5px;
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




</style>
