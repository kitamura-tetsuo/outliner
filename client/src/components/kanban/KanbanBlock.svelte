<script lang="ts">
import { onDestroy, onMount } from "svelte";
import type * as Y from "yjs";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { getItemKanbanId, observeItemKanbanId, type KanbanPlacementItem } from "../../services/yjstable/kanbanBinding";
import { createKanban, getKanbanHandles, listKanbans, observeKanbans } from "../../services/yjstable/kanbanDocs";
import { getTableRegistry, listTables } from "../../services/yjstable/tableDocs";
import { createPresetTable, type TablePreset } from "../../services/yjstable/tablePresets";
import TableCreationForm from "../yjstable/TableCreationForm.svelte";
import KanbanBoard from "./KanbanBoard.svelte";

interface Props { item: KanbanPlacementItem & { ydoc: Y.Doc; }; isReadOnly?: boolean; }
let { item, isReadOnly = false }: Props = $props();
let kanbanId = $state<string | undefined>();
let registryVersion = $state(0);
let creationMode = $state<"new-table" | "existing-table" | "existing-kanban">("new-table");
let selectedTableId = $state("");
let selectedKanbanId = $state("");
let error = $state<string | undefined>();
let stopItem: (() => void) | undefined;
let stopKanbans: (() => void) | undefined;
const projectId = $derived(yjsStore.currentProjectId ?? undefined);
const existingTables = $derived.by(() => { void registryVersion; return listTables(item.ydoc); });
const existingKanbans = $derived.by(() => { void registryVersion; return listKanbans(item.ydoc); });
const currentHandles = $derived.by(() => {
    void registryVersion;
    return kanbanId ? getKanbanHandles(item.ydoc, kanbanId) : undefined;
});
const refreshRegistry = () => { registryVersion++; };

$effect(() => {
    if (!existingTables.some(table => table.tableId === selectedTableId)) {
        selectedTableId = existingTables[0]?.tableId ?? "";
    }
    if (!existingKanbans.some(board => board.kanbanId === selectedKanbanId)) {
        selectedKanbanId = existingKanbans[0]?.kanbanId ?? "";
    }
});

onMount(() => {
    kanbanId = getItemKanbanId(item);
    stopItem = observeItemKanbanId(item, () => kanbanId = getItemKanbanId(item));
    stopKanbans = observeKanbans(item.ydoc, refreshRegistry);
    getTableRegistry(item.ydoc).observeDeep(refreshRegistry);
});

onDestroy(() => {
    stopItem?.();
    stopKanbans?.();
    getTableRegistry(item.ydoc).unobserveDeep(refreshRegistry);
});

function placementNode(): Y.Map<unknown> {
    if (isReadOnly) throw new Error("This Kanban placement is read-only.");
    const node = item.tree.getNodeValueFromKey(item.key) as Y.Map<unknown> | undefined;
    if (!node || node.get("componentType") !== "kanban" || node.get("kanbanId")) {
        throw new Error("The Kanban placement is no longer available for creation.");
    }
    return node;
}

function createWithPreset(preset: TablePreset, name: string, sqlName: string) {
    // Verify the live placement before creating any project-owned objects.
    const node = placementNode();
    const groupField = preset.key === "tasks" ? "status" : preset.key === "habits" ? "kind" : undefined;
    const titleField = preset.key === "habits" ? "name" : "title";
    item.ydoc.transact(() => {
        const tableId = createPresetTable(item.ydoc, preset, name, sqlName);
        const id = createKanban(item.ydoc, tableId, {
            name: name + " Kanban",
            query: preset.query(sqlName),
            groupField,
            titleField,
        });
        node.set("kanbanId", id);
        kanbanId = id;
    });
}

function createFromExistingTable() {
    try {
        const node = placementNode();
        const table = existingTables.find(candidate => candidate.tableId === selectedTableId);
        if (!table) throw new Error("The selected Table no longer exists.");
        item.ydoc.transact(() => {
            if (!getTableRegistry(item.ydoc).has(table.tableId)) throw new Error("The source Table was deleted.");
            const id = createKanban(item.ydoc, table.tableId, {
                name: (table.name || "Table") + " Kanban",
                query: table.sqlName ? "SELECT * FROM " + table.sqlName : "",
            });
            node.set("kanbanId", id);
            kanbanId = id;
        });
        error = undefined;
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }
}

function placeExistingKanban() {
    try {
        const node = placementNode();
        const id = selectedKanbanId;
        if (!existingKanbans.some(board => board.kanbanId === id)) {
            throw new Error("The selected Kanban no longer exists.");
        }
        item.ydoc.transact(() => {
            if (!listKanbans(item.ydoc).some(board => board.kanbanId === id)) {
                throw new Error("The selected Kanban was deleted.");
            }
            node.set("kanbanId", id);
            kanbanId = id;
        });
        error = undefined;
    } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
    }
}
</script>

<div class="kanban-placement" data-testid="kanban-placement" role="presentation">
    {#if kanbanId}
        {#if currentHandles}
            {#key currentHandles.entry}
                <KanbanBoard projectDoc={item.ydoc} {projectId} kanban={currentHandles} {isReadOnly} />
                <a href={`/${encodeURIComponent(projectId ?? "")}/-/kanbans/${encodeURIComponent(kanbanId)}`}>Open standalone board</a>
            {/key}
        {:else}
            <p role="alert" data-testid="kanban-missing">Kanban unavailable</p>
        {/if}
    {:else}
        <div class="create-panel" data-testid="kanban-create-panel">
            <div class="mode-tabs">
                <button type="button" class:active={creationMode === "new-table"} onclick={() => creationMode = "new-table"}>New Table</button>
                {#if existingTables.length > 0}
                    <button type="button" class:active={creationMode === "existing-table"} onclick={() => creationMode = "existing-table"}>New Kanban over Existing Table</button>
                {/if}
                {#if existingKanbans.length > 0}
                    <button type="button" class:active={creationMode === "existing-kanban"} onclick={() => creationMode = "existing-kanban"}>Existing Kanban</button>
                {/if}
            </div>
            {#if isReadOnly}
                <p role="alert">This location is read-only.</p>
            {:else if creationMode === "new-table"}
                <TableCreationForm {existingTables} onCreate={createWithPreset} buttonLabel="Create Table and Kanban" />
            {:else if creationMode === "existing-table"}
                <div class="create-form">
                    <select aria-label="Existing Table" data-testid="kanban-existing-table-select" bind:value={selectedTableId}>
                        {#each existingTables as table (table.tableId)}
                            <option value={table.tableId}>{table.name || "Untitled table"} ({table.sqlName})</option>
                        {/each}
                    </select>
                    <button type="button" data-testid="kanban-create-from-table" onclick={createFromExistingTable} disabled={!selectedTableId}>Create Kanban</button>
                </div>
                <p class="hint">Configure the query columns and lane grouping in the new Kanban.</p>
            {:else}
                <div class="create-form">
                    <select aria-label="Existing Kanban" data-testid="kanban-existing-board-select" bind:value={selectedKanbanId}>
                        {#each existingKanbans as board (board.kanbanId)}
                            <option value={board.kanbanId}>{board.name || "Untitled Kanban"}</option>
                        {/each}
                    </select>
                    <button type="button" data-testid="kanban-select-existing" onclick={placeExistingKanban} disabled={!selectedKanbanId}>Select Kanban</button>
                </div>
            {/if}
            {#if error}<p role="alert" class="error">{error}</p>{/if}
        </div>
    {/if}
</div>

<style>
.create-panel { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; }
.mode-tabs { display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px; }
.mode-tabs button { border: none; background: transparent; padding: 4px 8px; cursor: pointer; color: #6b7280; }
.mode-tabs button.active { background: #e5e7eb; color: #111827; font-weight: 600; }
.create-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.create-form select { border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 6px; }
.create-form button { color: #fff; background: #2563eb; border: none; border-radius: 4px; padding: 4px 12px; }
.create-form button:disabled { opacity: 0.5; }
.hint { font-size: 0.85rem; color: #6b7280; }
.error { color: #991b1b; }
</style>
