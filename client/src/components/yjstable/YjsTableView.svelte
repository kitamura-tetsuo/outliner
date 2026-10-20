<script lang="ts">
// One Grid lifetime, independent of the Y.Docs of its SQL suppliers.
import { describeViewSources, unavailableViewSources, type ViewSourceDiagnostics } from "../../../../shared/src/services/viewSourceDiagnostics";
import { resolveInsertTarget } from "../../services/yjstable/insertTargetResolver";
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
    getGridInsertTargetTableId,
    setGridInsertTargetTableId,
    getGridRegistry,
    getGridShowAddRowButton,
    type GridHandles,
    readGridComponents,
} from "../../services/yjstable/gridDocs";
import { createGridExistingRowMutationBoundary } from "../../services/yjstable/gridExistingRowMutation";
import { createGridInsertController, type GridInsertOutcome, type GridInsertState } from "../../services/yjstable/gridInsertController";
import { createGridMetadataResolver, type GridMetadataResolution } from "../../services/yjstable/gridMetadataResolver";
import { buildGridRenderTrace } from "../../services/yjstable/gridRenderTrace";
import { registerGridRenderTraceSource } from "../../services/yjstable/gridRenderTraceRegistry";
import {
    analyzeProjectQueryProvenance,
    type ProjectQueryProvenance,
} from "../../../../shared/src/services/projectQueryProvenance";
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
let sourceDiagnostics = $state.raw<ViewSourceDiagnostics>(unavailableViewSources("loading"));
let explicitPreference = $state<string | undefined>();
let insertOutcome = $state<GridInsertOutcome | undefined>();
let insertState = $state.raw<GridInsertState>({ loading: true, pending: false, candidates: [] });
let showInsertPreference = $state(false);
let insertPreferenceDraft = $state("");
let preferenceSaving = $state(false);
let preferenceError = $state<string | undefined>();
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
    onPreferenceChange: tableId => setGridInsertTargetTableId(mountedGrid, tableId),
});

function refreshGridMirror() {
    const preferenceChanged = explicitPreference !== getGridInsertTargetTableId(mountedGrid);
    explicitPreference = getGridInsertTargetTableId(mountedGrid);
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
    if (preferenceChanged) void publish(guardedSelect.state);
}
const gridMirrorObserver = () => refreshGridMirror();
async function publish(next: ProjectSelectState) {
    const request = ++publication;
    selectState = next.status === "success" ? { status: "loading" } : next;
    guardedAuthority = undefined;
    queryExecution = undefined;
    sourceDiagnostics = unavailableViewSources(next.status === "error" ? "error" : next.status === "loading" ? "loading" : "unavailable");
    clientRevision++;
    queryError = next.status === "error" || next.status === "unavailable" ? next.message : undefined;
    if (next.status !== "success") return;
    const evidence = next.evidence;
    const preference = getGridInsertTargetTableId(mountedGrid);
    const provenance = analyzeProjectQueryProvenance(evidence);

    // A completed SELECT is sufficient to render the read-only Grid and Chart.
    // Do not hold that visible result behind the independently asynchronous
    // metadata and INSERT-authority checks below: those checks can need more
    // relation leases, and a busy provider used to leave a valid demo result
    // displaying "Loading table..." until after the feature-tour assertion
    // timed out. Existing-row and INSERT controls remain guarded because
    // `guardedAuthority` is deliberately left unset until every check settles.
    if (destroyed || request !== publication || !guardedSelect.isEvidenceCurrent(evidence)
        || getGridRegistry(projectDoc).get(mountedGrid.gridId) !== mountedGrid.entry
        || preference !== getGridInsertTargetTableId(mountedGrid)) return;
    result = { columns: evidence.columns.map(column => column.name), rows: evidence.rows };
    selectState = next;
    queryExecution = {
        queryId: `${evidence.queryId}:${evidence.executionGeneration}`,
        generation: evidence.executionGeneration,
        query: evidence.query.trim(),
        status: "completed",
        rowCount: evidence.rows.length,
        columnCount: evidence.columns.length,
    };
    chartPanel?.update(result);

    const metadata = await guardedMetadataResolver.resolve(evidence, provenance, guardedSelect);
    const resolution = await resolveInsertTarget({
        projectDoc, evidence, provenance, insertTargetTableId: preference, session: guardedSelect,
        resolveRelation: async name => {
            const provider = await session.resolveRelation(name);
            // Resolution inspects detached metadata only; the SELECT session
            // separately retains the actual dependency provider holds.
            if (!provider) return undefined;
            session.releaseRelation(provider);
            return provider;
        },
    });
    if (destroyed || request !== publication || !guardedSelect.isEvidenceCurrent(evidence)
        || getGridRegistry(projectDoc).get(mountedGrid.gridId) !== mountedGrid.entry
        || preference !== getGridInsertTargetTableId(mountedGrid)) return;
    // Publish write/presentation authority only as one coherent incarnation.
    // The already-visible result stays read-only until this point.
    displayMetadata = metadata;
    sourceDiagnostics = describeViewSources(evidence, provenance, resolution);
    guardedAuthority = { evidence, provenance, metadata };
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
function currentViewSources(): ViewSourceDiagnostics {
    if (destroyed || !guardedAuthority || !guardedSelect.isEvidenceCurrent(guardedAuthority.evidence)
        || getGridRegistry(projectDoc).get(mountedGrid.gridId) !== mountedGrid.entry
        || explicitPreference !== getGridInsertTargetTableId(mountedGrid)) {
        return unavailableViewSources(sourceDiagnostics.execution.status === "completed" ? "unavailable" : sourceDiagnostics.execution.status);
    }
    return sourceDiagnostics;
}
function getGridRenderTrace() {
    return buildGridRenderTrace({
        gridId: mountedGrid.gridId,
        insertTargetTableId: explicitPreference,
        sourceDiagnostics: currentViewSources(),
        projectId,
        projectDocumentId: projectDoc.guid,
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
let unsubscribeInsert: (() => void) | undefined;
onMount(() => {
    refreshGridMirror();
    mountedGrid.entry.observeDeep(gridMirrorObserver);
    registerTableClipboardSource(mountedGrid.gridId, clipboardSource);
    unsubscribe = guardedSelect.subscribe(next => void publish(next));
    unsubscribeInsert = insertController.subscribe(next => insertState = next);
    cleanupWebMCP = registerWebMCPGridTools(
        () => ({ gridId: mountedGrid.gridId, insertTargetTableId: explicitPreference, sourceDiagnostics: currentViewSources(), query: gridQuery }),
        () => ({
            gridId: mountedGrid.gridId,
            insertTargetTableId: explicitPreference,
            sourceDiagnostics: currentViewSources(),
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
    unsubscribeInsert?.();
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
    data-source-table-ids={dependencies ? JSON.stringify(dependencies.filter(source => source.kind === "table").map(source => source.id).sort()) : undefined}
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

    <section aria-label="Row insertion">
        <button type="button" data-testid="grid-insert-preference-open" disabled={isReadOnly}
            onclick={() => {
                insertPreferenceDraft = getGridInsertTargetTableId(mountedGrid) ?? "";
                preferenceError = undefined;
                showInsertPreference = true;
            }}>INSERT destination</button>
        <span data-testid="grid-insert-resolution">{insertState.loading ? "Checking INSERT destination…"
            : insertState.resolution?.target ? `${insertState.resolution.mode}: ${insertState.resolution.target.sqlName}`
            : insertState.resolution?.mode === "selection-required" ? "Choose an INSERT destination before adding a row"
            : insertState.resolution?.reason ?? "No available INSERT destination"}</span>
        {#if insertState.resolution?.preferenceDiagnostic}
            <p role="status" data-testid="grid-insert-preference-diagnostic">{insertState.resolution.preferenceDiagnostic.message}</p>
        {/if}
        {#if showInsertPreference}
            <div role="group" aria-label="Choose INSERT destination">
                <label>Destination
                    <select data-testid="grid-insert-preference-select" bind:value={insertPreferenceDraft} disabled={preferenceSaving || isReadOnly}>
                        <option value="">Automatic (no manual preference)</option>
                        {#if insertPreferenceDraft && !insertState.candidates.some(candidate => candidate.id === insertPreferenceDraft)}
                            <option value={insertPreferenceDraft}>Unavailable: {insertPreferenceDraft}</option>
                        {/if}
                        {#each insertState.candidates as candidate (candidate.id)}
                            <option value={candidate.id}>{candidate.name || "Untitled Table"} · {candidate.sqlName} · {candidate.id}</option>
                        {/each}
                    </select>
                </label>
                <button type="button" data-testid="grid-insert-preference-apply" disabled={preferenceSaving || isReadOnly}
                    onclick={async () => {
                        preferenceSaving = true;
                        try {
                            preferenceError = await insertController.savePreference(insertPreferenceDraft || undefined);
                            if (!preferenceError) showInsertPreference = false;
                        } catch (error) { preferenceError = error instanceof Error ? error.message : "Could not save destination"; }
                        finally { preferenceSaving = false; }
                    }}>Apply</button>
                <button type="button" disabled={preferenceSaving} onclick={() => showInsertPreference = false}>Cancel</button>
                <p>The preference affects new rows. Query results and existing row edits keep their own source rules.</p>
                {#if preferenceError}<p role="alert" data-testid="grid-insert-preference-error">{preferenceError}</p>{/if}
            </div>
        {/if}
    </section>

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
                    addRowDisabled={insertState.pending || insertState.loading}
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
                        ? `Added row to ${insertOutcome.targetSqlName}${insertOutcome.visibility === "outside" ? "; outside the displayed result" : insertOutcome.visibility === "pending" ? "; query visibility not yet established" : ""}`
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
