<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { getItemKanbanId, observeItemKanbanId, type KanbanPlacementItem } from "../../services/yjstable/kanbanBinding";
import { createTableEngineSession } from "../../services/yjstable/tableEngine";
import { getKanbanHandles } from "../../services/yjstable/kanbanDocs";
import { projectKanbanRoute } from "../../lib/managementPaths";
import { store } from "../../stores/store.svelte";
import { invokingSurfaceWritable } from "../../services/editorSurface";
import { getTableRegistry, listTables } from "../../services/yjstable/tableDocs";
import { getKanbanRegistry, listKanbans } from "../../services/yjstable/kanbanDocs";
import { bindExistingKanban, createKanbanOverExistingTable, createKanbanWithNewTable } from "../../services/yjstable/kanbanSetup";
import TableCreationForm, { type TableCreationInput } from "../yjstable/TableCreationForm.svelte";
import { isForeignInput } from "../../lib/KeyEventHandler";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import KanbanBoard from "./KanbanBoard.svelte";

interface Props { item: KanbanPlacementItem & { ydoc: import("yjs").Doc; }; isReadOnly?: boolean; }
let { item, isReadOnly = false }: Props = $props();
let kanbanId = $state<string | undefined>();
let stop: (() => void) | undefined;
let version = $state(0);
let mode = $state<"new" | "table" | "board">("new");
let tableId = $state("");
let tableSqlName = $state<string | undefined>();
let boardId = $state("");
let error = $state<string | undefined>();
let savingTable = $state(false);
const tables = $derived.by(() => { void version; return listTables(item.ydoc); });
const boards = $derived.by(() => { void version; return listKanbans(item.ydoc); });
const handles = $derived.by(() => { void version; return kanbanId ? getKanbanHandles(item.ydoc, kanbanId) : undefined; });
const takenSqlNames = $derived(tables.map(table => table.sqlName));
const changed = () => version++;
function authorize() {
    return {
        projectAccess: Boolean(yjsStore.currentProjectId) && yjsStore.syncError !== "denied" && store.project?.ydoc === item.ydoc,
        surfaceWritable: !isReadOnly && invokingSurfaceWritable(),
    };
}
function run(action: () => string): string | undefined {
    try { action(); error = undefined; return undefined; }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); return error; }
}
function create(input: TableCreationInput) {
    let created: ReturnType<typeof createKanbanWithNewTable> | undefined;
    const failure = run(() => {
        created = createKanbanWithNewTable(item, input, authorize);
        return created.kanbanId;
    });
    if (!created) return failure;
    // A Table's durability cannot depend on the board having complete roles.
    // Acquire the newly committed Table through its ordinary connection/cache
    // lifecycle before displaying the board, then release this transient hold.
    savingTable = true;
    const session = createTableEngineSession({ projectDoc: item.ydoc, projectId });
    void session.acquire(created.tableId).catch(cause => {
        error = cause instanceof Error ? cause.message : String(cause);
    }).finally(() => { session.dispose(); savingTable = false; });
    return undefined;
}
function selectTable(id: string) {
    tableId = id;
    tableSqlName = tables.find(table => table.tableId === id)?.sqlName;
}
const projectId = $derived(yjsStore.currentProjectId ?? undefined);
onMount(() => {
    getTableRegistry(item.ydoc).observeDeep(changed);
    getKanbanRegistry(item.ydoc).observeDeep(changed);
    kanbanId = getItemKanbanId(item);
    stop = observeItemKanbanId(item, () => kanbanId = getItemKanbanId(item));
});
onDestroy(() => {
    stop?.();
    getTableRegistry(item.ydoc).unobserveDeep(changed);
    getKanbanRegistry(item.ydoc).unobserveDeep(changed);
});
</script>

<div class="kanban-placement" data-testid="kanban-placement" role="presentation"
    onclick={event => event.stopPropagation()} onmousedown={event => event.stopPropagation()}
    onfocusin={event => { if (isForeignInput(event.target)) editorOverlayStore.clearCursorAndSelection("local", true); }}>

    {#if savingTable}
        <p role="status">Saving Table…</p>
    {:else if kanbanId}
        {#each handles ? [handles] : [] as current (current.entry)}
            <KanbanBoard projectDoc={item.ydoc} {projectId} kanban={current} {isReadOnly} />
            {#if projectId}
                <a href={projectKanbanRoute(projectId, kanbanId)}>Open standalone board</a>
            {/if}
        {:else}
            <p role="alert" data-testid="kanban-missing">Kanban unavailable</p>
        {/each}
    {:else}
        <div data-testid="kanban-create-panel">
            <div class="mode-tabs">
                <button type="button" onclick={() => mode = "new"}>New Table</button>
                <button type="button" onclick={() => { mode = "table"; selectTable(tableId || tables[0]?.tableId || ""); }}>New Kanban over Existing Table</button>
                <button type="button" onclick={() => { mode = "board"; boardId ||= boards[0]?.kanbanId || ""; }}>Existing Kanban</button>
            </div>
            <div hidden={mode !== "new"}><TableCreationForm {takenSqlNames} oncreate={create} /></div>
            {#if mode === "table"}
                <select aria-label="Existing Table" value={tableId} onchange={event => selectTable(event.currentTarget.value)}>
                    <option value="">Choose a Table</option>
                    {#each tables as table (table.tableId)}<option value={table.tableId}>{table.name} ({table.sqlName}) — {table.tableId}</option>{/each}
                </select>
                <button type="button" disabled={!tableId} onclick={() => run(() => createKanbanOverExistingTable(item, tableId, tableSqlName, authorize))}>Create Kanban</button>
            {:else if mode === "board"}
                <select aria-label="Existing Kanban" bind:value={boardId}>
                    <option value="">Choose a Kanban</option>
                    {#each boards as board (board.kanbanId)}<option value={board.kanbanId}>{board.name} — {board.kanbanId}</option>{/each}
                </select>
                <button type="button" disabled={!boardId} onclick={() => run(() => bindExistingKanban(item, boardId, authorize))}>Use Kanban</button>
            {/if}
            {#if error}<p role="alert">{error}</p>{/if}
        </div>
    {/if}
    {#if error && kanbanId}<p role="alert">{error}</p>{/if}
</div>

<style>
.mode-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
button, select { font: inherit; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 8px; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .5; }
[role="alert"] { color: #b91c1c; }
</style>
