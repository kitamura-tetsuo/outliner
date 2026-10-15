<script lang="ts">
import { onDestroy, onMount } from "svelte";
import type * as Y from "yjs";
import { projectTablePath } from "../../lib/managementPaths";
import { getGridQuery, readGridComponents, type GridHandles } from "../../services/yjstable/gridDocs";
import { analyzeProjectQueryProvenance } from "../../services/yjstable/projectQueryProvenance";
import { resolvePath } from "../../utils/pathUtils";
import {
    createProjectSelectSession,
    type ProjectSelectSession,
    type ProjectSelectState,
} from "../../services/yjstable/projectSelectSession";
import { getTableHandles, listTables, type TableHandles } from "../../services/yjstable/tableDocs";
import TableUiDefEditor from "./TableUiDefEditor.svelte";
import YjsTableView from "./YjsTableView.svelte";

interface Props {
    grid: GridHandles;
    projectDoc: Y.Doc;
    projectId?: string;
    projectName?: string;
    isReadOnly?: boolean;
}

let { grid, projectDoc, projectId, projectName, isReadOnly = false }: Props = $props();
let query = $state("");
let state = $state<ProjectSelectState>({ status: "loading" });
let showDefinition = $state(false);
let session: ProjectSelectSession | undefined;
let unsubscribe: (() => void) | undefined;
let actualSource = $state<{
    handles: TableHandles;
    name: string;
    sqlName: string;
    href?: string;
} | undefined>();
let columns = $state<string[]>([]);
let labels = $state<Record<string, string | undefined>>({});
let hidden = $state<Record<string, boolean>>({});
let widths = $state<Record<string, number>>({});
let types = $state<Record<string, string | undefined>>({});

function refresh() {
    const next = getGridQuery(grid);
    const settings = readGridComponents(grid);
    query = next;
    columns = Array.isArray(grid.entry.get("columnOrder")) ? grid.entry.get("columnOrder") as string[] : [];
    labels = settings.labels;
    hidden = settings.hidden;
    widths = settings.widths;
    types = settings.types;
    session?.setQuery(next);
}

const observer = () => refresh();
const evidence = $derived(state.status === "success" ? state.evidence : state.previous);
const displayColumns = $derived([
    ...columns.filter(column => evidence?.columns.some(item => item.name === column) && !hidden[column]),
    ...(evidence?.columns.map(item => item.name).filter(column => !columns.includes(column) && !hidden[column]) ?? []),
]);

function resolveActualSource(next: ProjectSelectState) {
    actualSource = undefined;
    if (next.status !== "success") return;
    const proof = analyzeProjectQueryProvenance(next.evidence);
    const source = proof.status === "proven" ? proof.bareIdSource : undefined;
    if (!source || source.kind !== "table" || !session?.isEvidenceCurrent(next.evidence)) return;
    const handles = getTableHandles(projectDoc, source.id);
    if (!handles || !session?.isEvidenceCurrent(next.evidence)) return;
    const entry = listTables(projectDoc).find(table => table.tableId === source.id);
    if (!entry || entry.sqlName !== source.sqlName) return;
    actualSource = {
        handles,
        name: entry.name || source.sqlName,
        sqlName: source.sqlName,
        href: projectName ? resolvePath(projectTablePath(projectName, source.id)) : undefined,
    };
}

onMount(() => {
    refresh();
    session = createProjectSelectSession({ projectDoc, projectId, query });
    unsubscribe = session.subscribe(next => {
        state = next;
        resolveActualSource(next);
    });
    grid.entry.observeDeep(observer);
});

onDestroy(() => {
    grid.entry.unobserveDeep(observer);
    unsubscribe?.();
    session?.dispose();
});
</script>

{#if actualSource}
    {#key `${actualSource.handles.tableId}:${actualSource.handles.doc.guid}`}
        <YjsTableView
            {grid}
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
<div class="project-grid-view" data-testid="yjs-table-view" data-grid-id={grid.gridId}>
    <div class="toolbar">
        <strong>{String(grid.entry.get("name") ?? "Grid")}</strong>
        <button type="button" aria-pressed={showDefinition} onclick={() => showDefinition = !showDefinition}>UI</button>
    </div>
    <div class="dependencies" data-testid="grid-query-dependencies">
        {#if state.status === "success" && state.evidence.sources.length === 0}
            <span>No project Table dependencies</span>
        {:else if evidence?.sources.length}
            <span>Sources:</span>
            {#each evidence.sources as source (`${source.kind}:${source.id}`)}
                {#if source.kind === "table" && projectName}
                    <a href={resolvePath(projectTablePath(projectName, source.id))}>{source.sqlName}</a>
                {:else}
                    <span>{source.sqlName} ({source.kind})</span>
                {/if}
            {/each}
        {:else}
            <span>SQL dependencies unavailable</span>
        {/if}
    </div>
    {#if showDefinition}
        <TableUiDefEditor
            {grid}
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
