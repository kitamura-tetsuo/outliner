<script lang="ts">
import { onDestroy, onMount } from "svelte";
import type * as Y from "yjs";
import { resolve } from "$app/paths";
import { projectTablePath } from "../../lib/managementPaths";
import { getGridQuery, readGridComponents, type GridHandles } from "../../services/yjstable/gridDocs";
import { analyzeProjectQueryProvenance } from "../../services/yjstable/projectQueryProvenance";
import {
    createProjectSelectSession,
    type ProjectSelectSession,
    type ProjectSelectState,
} from "../../services/yjstable/projectSelectSession";
import { getTableHandles, getTableRegistry, listTables, type TableHandles } from "../../services/yjstable/tableDocs";
import { rewriteTableQuerySql } from "../../services/yjstable/tableSqlRewrite";
import TableUiDefEditor from "./TableUiDefEditor.svelte";
import YjsTableView from "./YjsTableView.svelte";

interface Props {
    grid: GridHandles;
    projectDoc: Y.Doc;
    projectId?: string;
    projectName?: string;
    isReadOnly?: boolean;
    /** Ephemeral creation-time hint; current SELECT evidence replaces it. */
    bootstrapSourceTableId?: string;
    onSourceResolved?: (source: { tableId: string; name: string; sqlName: string; }) => void;
}

let {
    grid,
    projectDoc,
    projectId,
    projectName,
    isReadOnly = false,
    bootstrapSourceTableId,
    onSourceResolved,
}: Props = $props();
// The parent keys this component by Grid identity. Preserve the mounted
// handles because Svelte may update a disappearing parent's derived prop to
// undefined before this component's teardown runs.
// svelte-ignore state_referenced_locally
const mountedGrid = grid;
let query = $state("");
let state = $state<ProjectSelectState>({ status: "loading" });
let showDefinition = $state(false);
let session: ProjectSelectSession | undefined;
let unsubscribe: (() => void) | undefined;
let fallbackHasFocus = $state(false);
let actualSource = $state<{
    handles: TableHandles;
    name: string;
    sqlName: string;
    href?: string;
} | undefined>();
let pendingActualSource: typeof actualSource;
let columns = $state<string[]>([]);
let labels = $state<Record<string, string | undefined>>({});
let hidden = $state<Record<string, boolean>>({});
let widths = $state<Record<string, number>>({});
let types = $state<Record<string, string | undefined>>({});

function refresh() {
    const next = getGridQuery(mountedGrid);
    const settings = readGridComponents(mountedGrid);
    query = next;
    columns = Array.isArray(mountedGrid.entry.get("columnOrder"))
        ? mountedGrid.entry.get("columnOrder") as string[]
        : [];
    labels = settings.labels;
    hidden = settings.hidden;
    widths = settings.widths;
    types = settings.types;
    if (!actualSource) resolveQueryDependencySource(next);
    session?.setQuery(next);
}

function resolveBootstrapSource() {
    if (!bootstrapSourceTableId || actualSource) return;
    const entry = listTables(projectDoc).find(table => table.tableId === bootstrapSourceTableId);
    const handles = getTableHandles(projectDoc, bootstrapSourceTableId);
    if (!entry || !handles) return;
    actualSource = {
        handles,
        name: entry.name || entry.sqlName,
        sqlName: entry.sqlName,
        href: projectName ? resolve(projectTablePath(projectName, entry.tableId)) : undefined,
    };
    onSourceResolved?.({ tableId: entry.tableId, name: entry.name || entry.sqlName, sqlName: entry.sqlName });
}

function resolveQueryDependencySource(nextQuery: string) {
    let dependencies: string[];
    try {
        dependencies = rewriteTableQuerySql(nextQuery, new Map()).actualRelationDependencies;
    } catch {
        return;
    }
    if (dependencies.length !== 1) return;
    const entry = listTables(projectDoc).find(table => table.sqlName === dependencies[0]);
    if (!entry) return;
    const handles = getTableHandles(projectDoc, entry.tableId);
    if (!handles) return;
    actualSource = {
        handles,
        name: entry.name || entry.sqlName,
        sqlName: entry.sqlName,
        href: projectName ? resolve(projectTablePath(projectName, entry.tableId)) : undefined,
    };
    onSourceResolved?.({ tableId: entry.tableId, name: entry.name || entry.sqlName, sqlName: entry.sqlName });
}

const observer = () => refresh();
const tableRegistryObserver = () => {
    if (!actualSource) resolveQueryDependencySource(query);
};
const evidence = $derived(state.status === "success" ? state.evidence : state.previous);
const bootstrapDependency = $derived.by(() => {
    if (!bootstrapSourceTableId) return undefined;
    const entry = listTables(projectDoc).find(table => table.tableId === bootstrapSourceTableId);
    return {
        id: bootstrapSourceTableId,
        sqlName: entry?.sqlName ?? "Table",
        href: projectName ? resolve(projectTablePath(projectName, bootstrapSourceTableId)) : undefined,
    };
});
const displayColumns = $derived([
    ...columns.filter(column => evidence?.columns.some(item => item.name === column) && !hidden[column]),
    ...(evidence?.columns.map(item => item.name).filter(column => !columns.includes(column) && !hidden[column]) ?? []),
]);

function resolveActualSource(next: ProjectSelectState) {
    // Keep the mounted rich surface while a changed query is being evaluated.
    // Clearing it for the session's transient loading state destroys the SQL
    // editor before its blur/commit handler finishes and turns an ordinary
    // refresh into a permanent loss of Grid controls. A completed result below
    // is the only state allowed to replace the current source decision.
    if (next.status !== "success") return;
    const proof = analyzeProjectQueryProvenance(next.evidence);
    // A plain SELECT has one proven bare-id source. More complex readable
    // results still use the rich Grid surface for selection/copy/search and
    // source-addressed operations; its existing query authority fails closed
    // for bare-id writes. The first current dependency supplies only the
    // renderer's schema/adapter lifecycle, never primary ownership.
    const source = (proof.status === "proven" ? proof.bareIdSource : undefined)
        ?? next.evidence.sources.find(candidate => candidate.kind === "table");
    if (!source || source.kind !== "table" || !session?.isEvidenceCurrent(next.evidence)) return;
    const handles = getTableHandles(projectDoc, source.id);
    if (!handles || !session?.isEvidenceCurrent(next.evidence)) return;
    const entry = listTables(projectDoc).find(table => table.tableId === source.id);
    if (!entry || entry.sqlName !== source.sqlName) return;
    const resolved = {
        handles,
        name: entry.name || source.sqlName,
        sqlName: source.sqlName,
        href: projectName ? resolve(projectTablePath(projectName, source.id)) : undefined,
    };
    onSourceResolved?.({ tableId: entry.tableId, name: entry.name || source.sqlName, sqlName: source.sqlName });
    if (fallbackHasFocus) {
        pendingActualSource = resolved;
        return;
    }
    actualSource = resolved;
}

function finishFallbackInteraction() {
    fallbackHasFocus = false;
    if (!pendingActualSource) return;
    requestAnimationFrame(() => {
        if (fallbackHasFocus || !pendingActualSource) return;
        actualSource = pendingActualSource;
        pendingActualSource = undefined;
    });
}

onMount(() => {
    resolveBootstrapSource();
    refresh();
    session = createProjectSelectSession({ projectDoc, projectId, query });
    unsubscribe = session.subscribe(next => {
        state = next;
        resolveActualSource(next);
    });
    mountedGrid.entry.observeDeep(observer);
    getTableRegistry(projectDoc).observeDeep(tableRegistryObserver);
});

onDestroy(() => {
    mountedGrid.entry.unobserveDeep(observer);
    getTableRegistry(projectDoc).unobserveDeep(tableRegistryObserver);
    unsubscribe?.();
    session?.dispose();
});
</script>

{#if actualSource}
    {#key `${actualSource.handles.tableId}:${actualSource.handles.doc.guid}`}
        <YjsTableView
            grid={mountedGrid}
            handles={actualSource.handles}
            {projectDoc}
            {projectId}
            tableName={actualSource.name}
            sqlName={actualSource.sqlName}
            sourceTableHref={actualSource.href}
            {isReadOnly}
        />
    {/key}
{:else}
<div
    class="project-grid-view"
    data-testid="yjs-table-view"
    data-grid-id={mountedGrid.gridId}
    onfocusin={() => fallbackHasFocus = true}
    onfocusout={finishFallbackInteraction}
>
    <div class="toolbar">
        <strong>{String(mountedGrid.entry.get("name") ?? "Grid")}</strong>
        <button data-testid="yjs-table-toggle-ui" type="button" aria-pressed={showDefinition} onclick={() => showDefinition = !showDefinition}>UI</button>
    </div>
    <div class="dependencies" data-testid="grid-query-dependencies">
        {#if state.status === "success" && state.evidence.sources.length === 0}
            <span>No project Table dependencies</span>
        {:else if evidence?.sources.length}
            <span>Sources:</span>
            {#each evidence.sources as source (`${source.kind}:${source.id}`)}
                {#if source.kind === "table" && projectName}
                    <a href={resolve(projectTablePath(projectName, source.id))}>{source.sqlName}</a>
                {:else}
                    <span>{source.sqlName} ({source.kind})</span>
                {/if}
            {/each}
        {:else if bootstrapDependency}
            <span>Sources:</span>
            {#if bootstrapDependency.href}
                <a data-testid="yjs-grid-source-table-link" href={bootstrapDependency.href}>{bootstrapDependency.sqlName}</a>
            {:else}
                <span>{bootstrapDependency.sqlName} (table)</span>
            {/if}
        {:else}
            <span>SQL dependencies unavailable</span>
        {/if}
    </div>
    {#if showDefinition}
        <TableUiDefEditor
            grid={mountedGrid}
            schema={undefined}
            {query}
            componentTypes={types}
            columnLabels={labels}
            hiddenColumns={hidden}
            resultColumns={evidence?.columns.map(column => column.name) ?? []}
            columnOrder={columns}
            showAddRowButton={false}
            confirmRowDelete={false}
            columnWidths={widths}
            {isReadOnly}
        />
    {/if}
    {#if state.status === "error" || state.status === "unavailable"}
        <p class="error" data-testid="yjs-table-query-error">{state.message}</p>
    {:else if !evidence}
        <p>Loading query…</p>
    {:else}
        {#if state.status === "loading"}<p class="refreshing">Refreshing…</p>{/if}
        <div class="scroll"><table>
            <thead><tr>{#each displayColumns as column (column)}<th style:width={widths[column] ? `${widths[column]}px` : undefined}>{labels[column] || column}</th>{/each}</tr></thead>
            <tbody>{#each evidence.rows as row, rowIndex (rowIndex)}<tr>{#each displayColumns as column (column)}<td>{row[column] == null ? "" : String(row[column])}</td>{/each}</tr>{/each}</tbody>
        </table></div>
        <p class="readonly">This result is readable and copyable. Editing is unavailable until its physical source can be proven.</p>
    {/if}
</div>
{/if}

<style>
.project-grid-view { display:flex; flex-direction:column; gap:8px; width:100%; }
.toolbar { display:flex; align-items:center; justify-content:space-between; }
.scroll { overflow:auto; }
table { border-collapse:collapse; min-width:100%; }
th,td { border:1px solid #d1d5db; padding:6px 8px; text-align:left; }
.error { color:#b91c1c; }
.refreshing,.readonly { color:#6b7280; font-size:.8rem; }
.dependencies { display:flex; gap:6px; color:#4b5563; font-size:.8rem; }
.dependencies a { color:#2563eb; text-decoration:underline; }
</style>
