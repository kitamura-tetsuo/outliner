<script lang="ts">
// Entry point of the consolidated Grid feature: an embedded block inside an
// outliner item (componentType "yjstable"). The item stores a `gridId`; the
// Grid itself is a project-level registry entry referencing one source Table.
//
// The rendered view is wrapped in {#key gridId + tableDoc.guid}: switching
// either the Grid or the underlying Y.Doc remounts the whole view instead of
// rebinding observers in place.

import { onDestroy, onMount } from "svelte";
import {
    bindItemToGrid,
    getItemGridId,
    observeItemGridId,
} from "../../services/yjstable/itemBinding";
import {
    getTableHandles,
    getTableName,
    getTableRegistry,
    getTableSqlName,
    listTables,
} from "../../services/yjstable/tableDocs";
import {
    createGrid,
    getGridHandles,
    getGridRegistry,
    getGridSourceTableId,
    listGrids,
} from "../../services/yjstable/gridDocs";
import { createTableFromPreset, TABLE_PRESETS } from "../../services/yjstable/tablePresets";
import { deriveSqlName, sqlNameError } from "../../services/yjstable/sqlNames";
import { page as pageStore } from "$app/stores";
import { yjsStore } from "../../stores/yjsStore.svelte";
import YjsTableView from "./YjsTableView.svelte";
import { isForeignInput } from "../../lib/KeyEventHandler";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";

interface ItemLike {
    ydoc: import("yjs").Doc;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

interface Props {
    item: ItemLike;
}

let { item }: Props = $props();

let gridId = $state<string | undefined>();
// Bumped by Yjs observers so the $derived lookups below re-evaluate.
let registryVersion = $state(0);

let presetKey = $state("tasks");
let newTableName = $state("");
// The SQL name is derived from the display name until the user edits it, so
// the common case needs no extra typing while the identifier stays visible.
let newSqlName = $state("");
let sqlNameEdited = $state(false);
let createError = $state<string | undefined>(undefined);

// Three creation modes: brand-new Table+Grid, new Grid over an existing Table,
// or bind to an existing Grid. The last one is the "many Grids per outline"
// side of the many-Grids-per-Table story.
let creationMode = $state<"new" | "existing-table" | "existing-grid">("new");
let selectedExistingTableId = $state<string | undefined>(undefined);
let selectedExistingGridId = $state<string | undefined>(undefined);

const existingTables = $derived.by(() => {
    void registryVersion;
    return item.ydoc ? listTables(item.ydoc) : [];
});
const existingGrids = $derived.by(() => {
    void registryVersion;
    return item.ydoc ? listGrids(item.ydoc) : [];
});

function showExistingTables() {
    creationMode = "existing-table";
    if (!selectedExistingTableId) selectedExistingTableId = existingTables[0]?.tableId;
}
function showExistingGrids() {
    creationMode = "existing-grid";
    if (!selectedExistingGridId) selectedExistingGridId = existingGrids[0]?.gridId;
}

const grid = $derived.by(() => {
    void registryVersion;
    return gridId ? getGridHandles(item.ydoc, gridId) : undefined;
});

const sourceTableId = $derived.by(() => {
    void registryVersion;
    return gridId ? getGridSourceTableId(item.ydoc, gridId) : undefined;
});

const handles = $derived.by(() => {
    void registryVersion;
    return sourceTableId ? getTableHandles(item.ydoc, sourceTableId) : undefined;
});
const tableName = $derived.by(() => {
    void registryVersion;
    return sourceTableId ? getTableName(item.ydoc, sourceTableId) : undefined;
});
const tableSqlName = $derived.by(() => {
    void registryVersion;
    return sourceTableId ? getTableSqlName(item.ydoc, sourceTableId) : undefined;
});
const tableSourceProjectId = $derived.by(() => {
    void registryVersion;
    if (!sourceTableId) return undefined;
    const entry = existingTables.find(t => t.tableId === sourceTableId);
    return entry?.sourceProjectId;
});

const takenSqlNames = $derived(existingTables.map((t) => t.sqlName).filter(Boolean));
const suggestedSqlName = $derived.by(() => {
    const preset = TABLE_PRESETS.find((p) => p.key === presetKey) ?? TABLE_PRESETS[0];
    return deriveSqlName(newTableName.trim() || preset.defaultSqlName, takenSqlNames);
});
const effectiveSqlName = $derived(sqlNameEdited ? newSqlName.trim() : suggestedSqlName);
const projectId = $derived(yjsStore.currentProjectId ?? undefined);
// The route name the user navigated with, the same one the sidebar links
// with. Used to point at the source Table's own page — schema and data are
// Table-owned, so the block references the Table instead of hosting it.
const routeProjectName = $derived(
    $pageStore.params.demoProject || $pageStore.params.project || undefined,
);
const sourceTableHref = $derived(
    routeProjectName && sourceTableId
        ? `/tables/${encodeURIComponent(routeProjectName)}/${encodeURIComponent(sourceTableId)}`
        : undefined,
);

const registryObserver = () => {
    registryVersion++;
};
let unobserveItem: (() => void) | undefined;

onMount(() => {
    gridId = getItemGridId(item);
    getTableRegistry(item.ydoc).observeDeep(registryObserver);
    getGridRegistry(item.ydoc).observeDeep(registryObserver);
    unobserveItem = observeItemGridId(item, () => {
        gridId = getItemGridId(item);
    });
});

onDestroy(() => {
    getTableRegistry(item.ydoc).unobserveDeep(registryObserver);
    getGridRegistry(item.ydoc).unobserveDeep(registryObserver);
    unobserveItem?.();
});

function selectExistingTable() {
    if (!selectedExistingTableId) return;
    // Create a fresh Grid over the chosen Table so the block gets its own
    // presentation state — never share a Grid entry between different outline
    // hosts by accident.
    const table = existingTables.find(t => t.tableId === selectedExistingTableId);
    const newGridId = createGrid(item.ydoc, selectedExistingTableId, {
        name: table?.name ?? "Grid",
        query: `SELECT * FROM ${table?.sqlName ?? "table"}`,
    });
    bindItemToGrid(item, newGridId, selectedExistingTableId);
    gridId = newGridId;
}

function selectExistingGrid() {
    if (!selectedExistingGridId) return;
    bindItemToGrid(item, selectedExistingGridId, getGridSourceTableId(item.ydoc, selectedExistingGridId));
    gridId = selectedExistingGridId;
}

function createFromPreset() {
    const preset = TABLE_PRESETS.find((p) => p.key === presetKey) ?? TABLE_PRESETS[0];
    const name = newTableName.trim() || preset.name;
    const sqlName = effectiveSqlName;
    createError = sqlNameError(sqlName);
    if (createError) return;
    if (takenSqlNames.includes(sqlName)) {
        createError = `SQL name "${sqlName}" is already used in this project`;
        return;
    }
    const { tableId, gridId: newGridId } = createTableFromPreset(item.ydoc, preset, name, sqlName);
    bindItemToGrid(item, newGridId, tableId);
    gridId = newGridId;
}
</script>

<div
    class="yjs-table-block"
    data-testid="yjs-table-block"
    onclick={e => e.stopPropagation()}
    onmousedown={e => e.stopPropagation()}
    onfocusin={(e) => {
        if (isForeignInput(e.target)) {
            editorOverlayStore.clearCursorAndSelection("local", true);
        }
    }}
    role="presentation"
>
    {#if grid && handles}
        {#key `${grid.gridId}::${handles.doc.guid}`}
            <YjsTableView {grid} {handles} projectDoc={item.ydoc} {projectId} {tableName} sqlName={tableSqlName} sourceProjectId={tableSourceProjectId} {sourceTableHref} />
        {/key}
    {:else if grid && !handles}
        <!-- Missing source Table: explicit error, not a silent empty grid. -->
        <p class="error" data-testid="yjs-grid-missing-source">
            This Grid references a Table that no longer exists in this project.
        </p>
    {:else if gridId}
        <p class="loading" data-testid="yjs-table-waiting">Loading grid...</p>
    {:else}
        <div class="create-panel" data-testid="yjs-table-create-panel">
            <div class="mode-tabs">
                <button type="button" class="mode-tab" class:active={creationMode === "new"} onclick={() => creationMode = "new"}>New Table</button>
                {#if existingTables.length > 0}
                    <button type="button" class="mode-tab" class:active={creationMode === "existing-table"} onclick={showExistingTables}>New Grid over Existing Table</button>
                {/if}
                {#if existingGrids.length > 0}
                    <button type="button" class="mode-tab" class:active={creationMode === "existing-grid"} onclick={showExistingGrids}>Existing Grid</button>
                {/if}
            </div>

            {#if creationMode === "new"}
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
                        onpointerdown={(e: Event) => e.stopPropagation()}
                        onmousedown={(e: Event) => e.stopPropagation()}
                        onmouseup={(e: Event) => e.stopPropagation()}
                        onclick={(e: Event) => {
                            e.stopPropagation();
                            (e.target as HTMLElement).focus();
                        }}
                        onchange={(e) => {
                            presetKey = (e.target as HTMLSelectElement).value;
                        }}
                    >
                        {#each TABLE_PRESETS as preset (preset.key)}
                            <option value={preset.key}>{preset.name}</option>
                        {/each}
                    </select>
                    <input
                        type="text"
                        aria-label="SQL name"
                        placeholder={suggestedSqlName}
                        data-testid="yjs-table-sql-name-input"
                        value={effectiveSqlName}
                        oninput={(e) => {
                            sqlNameEdited = true;
                            newSqlName = (e.target as HTMLInputElement).value;
                        }}
                    />
                    <button type="button" data-testid="yjs-table-create" onclick={createFromPreset}>
                        Create
                    </button>
                </div>
                <p class="hint">Queries reference this table as <code>{effectiveSqlName || "?"}</code>.</p>
                {#if createError}
                    <p class="create-error" data-testid="yjs-table-create-error">{createError}</p>
                {/if}
            {:else if creationMode === "existing-table"}
                <div class="create-form">
                    <select
                        aria-label="Existing Table"
                        data-testid="yjs-table-existing-select"
                        value={selectedExistingTableId}
                        onpointerdown={(e: Event) => e.stopPropagation()}
                        onmousedown={(e: Event) => e.stopPropagation()}
                        onmouseup={(e: Event) => e.stopPropagation()}
                        onclick={(e: Event) => {
                            e.stopPropagation();
                            (e.target as HTMLElement).focus();
                        }}
                        onchange={(e) => {
                            selectedExistingTableId = (e.target as HTMLSelectElement).value;
                        }}
                    >
                        {#each existingTables as table (table.tableId)}
                            <option value={table.tableId}>
                                {table.name || "Untitled table"}{table.sqlName ? ` (${table.sqlName})` : ""}{table.sourceProjectId ? ` (copied from ${table.sourceProjectId})` : ""}
                            </option>
                        {/each}
                    </select>
                    <button type="button" data-testid="yjs-table-select-existing" onclick={selectExistingTable}>
                        Create Grid
                    </button>
                </div>
                <p class="hint">A fresh Grid over the chosen Table. Multiple Grids can share a Table without cloning its data.</p>
            {:else}
                <div class="create-form">
                    <select
                        aria-label="Existing Grid"
                        data-testid="yjs-grid-existing-select"
                        value={selectedExistingGridId}
                        onpointerdown={(e: Event) => e.stopPropagation()}
                        onmousedown={(e: Event) => e.stopPropagation()}
                        onmouseup={(e: Event) => e.stopPropagation()}
                        onclick={(e: Event) => {
                            e.stopPropagation();
                            (e.target as HTMLElement).focus();
                        }}
                        onchange={(e) => {
                            selectedExistingGridId = (e.target as HTMLSelectElement).value;
                        }}
                    >
                        {#each existingGrids as g (g.gridId)}
                            <option value={g.gridId}>
                                {g.name || "Untitled grid"}
                            </option>
                        {/each}
                    </select>
                    <button type="button" data-testid="yjs-grid-select-existing" onclick={selectExistingGrid}>
                        Select Grid
                    </button>
                </div>
                <p class="hint">Show an existing Grid at this outline location too.</p>
            {/if}
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

.error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0;
}

.create-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.hint {
    font-size: 0.75rem;
    color: #6b7280;
    margin: 0;
}

.hint code {
    font-family: ui-monospace, monospace;
    background: #f3f4f6;
    border-radius: 3px;
    padding: 0 4px;
}

.create-error {
    font-size: 0.8rem;
    color: #dc2626;
    margin: 0;
}

.mode-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
}

.mode-tab {
    background: none;
    border: none;
    padding: 4px 8px;
    font-size: 0.85rem;
    color: #6b7280;
    cursor: pointer;
    border-radius: 4px;
}

.mode-tab:hover {
    background: #f3f4f6;
}

.mode-tab.active {
    color: #111827;
    font-weight: 600;
    background: #e5e7eb;
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
