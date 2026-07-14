<script lang="ts">
// Entry point of the consolidated table feature: an embedded block inside an
// outliner item (componentType "yjstable"). The item stores only the table id;
// the table itself is a Y.Doc subdoc registered in the project doc.
//
// The rendered view is wrapped in {#key doc.guid}: switching the underlying
// Y.Doc remounts the whole view instead of rebinding observers in place.

import { onDestroy, onMount } from "svelte";
import {
    getItemTableId,
    observeItemTableId,
    setItemTableId,
} from "../../services/yjstable/itemBinding";
import { getTableHandles, getTableName, getTableRegistry } from "../../services/yjstable/tableDocs";
import { createTableFromPreset, TABLE_PRESETS } from "../../services/yjstable/tablePresets";
import { yjsStore } from "../../stores/yjsStore.svelte";
import YjsTableView from "./YjsTableView.svelte";

interface ItemLike {
    ydoc: import("yjs").Doc;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

interface Props {
    item: ItemLike;
}

let { item }: Props = $props();

let tableId = $state<string | undefined>(getItemTableId(item));
// Bumped by Yjs observers so the $derived lookups below re-evaluate.
let registryVersion = $state(0);

let presetKey = $state("tasks");
let newTableName = $state("");

const handles = $derived.by(() => {
    void registryVersion;
    return tableId ? getTableHandles(item.ydoc, tableId) : undefined;
});
const tableName = $derived.by(() => {
    void registryVersion;
    return tableId ? getTableName(item.ydoc, tableId) : undefined;
});
const projectId = $derived(yjsStore.currentProjectId ?? undefined);

const registryObserver = () => {
    registryVersion++;
};
let unobserveItem: (() => void) | undefined;

onMount(() => {
    getTableRegistry(item.ydoc).observeDeep(registryObserver);
    unobserveItem = observeItemTableId(item, () => {
        tableId = getItemTableId(item);
    });
});

onDestroy(() => {
    getTableRegistry(item.ydoc).unobserveDeep(registryObserver);
    unobserveItem?.();
});

function createFromPreset() {
    const preset = TABLE_PRESETS.find((p) => p.key === presetKey) ?? TABLE_PRESETS[0];
    const name = newTableName.trim() || preset.name;
    const id = createTableFromPreset(item.ydoc, preset, name);
    setItemTableId(item, id);
    tableId = id;
}
</script>

<div class="yjs-table-block" data-testid="yjs-table-block">
    {#if handles}
        {#key handles.doc.guid}
            <YjsTableView {handles} {projectId} {tableName} />
        {/key}
    {:else if tableId}
        <p class="loading" data-testid="yjs-table-waiting">Loading table...</p>
    {:else}
        <div class="create-panel" data-testid="yjs-table-create-panel">
            <p class="create-title">Create a database table</p>
            <div class="create-form">
                <input
                    type="text"
                    placeholder="Table name"
                    data-testid="yjs-table-name-input"
                    value={newTableName}
                    oninput={(e) => {
                        newTableName = (e.target as HTMLInputElement).value;
                    }}
                />
                <select
                    aria-label="Preset"
                    data-testid="yjs-table-preset-select"
                    value={presetKey}
                    onchange={(e) => {
                        presetKey = (e.target as HTMLSelectElement).value;
                    }}
                >
                    {#each TABLE_PRESETS as preset (preset.key)}
                        <option value={preset.key}>{preset.name}</option>
                    {/each}
                </select>
                <button type="button" data-testid="yjs-table-create" onclick={createFromPreset}>
                    Create
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
.yjs-table-block {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 8px;
    margin-top: 8px;
    background: white;
}

.create-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.create-title {
    font-weight: 600;
    margin: 0;
    font-size: 0.9rem;
}

.create-form {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}

.create-form input,
.create-form select {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85rem;
}

.create-form button {
    border: 1px solid #2563eb;
    border-radius: 4px;
    background: #2563eb;
    color: white;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 0.85rem;
}

.loading {
    color: #6b7280;
    font-size: 0.85rem;
    margin: 0;
}
</style>
