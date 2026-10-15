<script module lang="ts">
// Identity tokens for Grid registry entries: replacing an entry under the
// same Grid ID (same Table doc) must remount the view, discarding editor
// drafts captured against the replaced object.
const gridEntryTokens = new WeakMap<object, number>();
let nextGridEntryToken = 1;

function gridEntryTokenOf(entry: object): number {
    const existing = gridEntryTokens.get(entry);
    if (existing !== undefined) return existing;
    const token = nextGridEntryToken++;
    gridEntryTokens.set(entry, token);
    return token;
}
</script>

<script lang="ts">
// Entry point of the consolidated Grid feature: an embedded block inside an
// outliner item (componentType "yjstable"). The item stores a `gridId`; the
// Grid itself is a project-level registry entry referencing one source Table.
//
// The rendered view is wrapped in {#key gridId + tableDoc.guid + entry}: switching
// the Grid, replacing its registry entry, or the underlying Y.Doc remounts the
// whole view instead of rebinding observers in place.

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
import { createTableFromPreset } from "../../services/yjstable/tablePresets";
import { sqlNameError } from "../../services/yjstable/sqlNames";
import { resolvePath } from "../../utils/pathUtils";
import { projectTablePath } from "../../lib/managementPaths";
import { page as pageState } from "$app/state";
import { yjsStore } from "../../stores/yjsStore.svelte";
import YjsTableView from "./YjsTableView.svelte";
import ProjectGridView from "./ProjectGridView.svelte";
import { isForeignInput } from "../../lib/KeyEventHandler";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { store } from "../../stores/store.svelte";
import TableCreationForm, { type TableCreationInput } from "./TableCreationForm.svelte";

interface ItemLike {
    ydoc: import("yjs").Doc;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

interface Props {
    item: ItemLike;
    /**
     * Host surface restriction (outline read-only state). Forwarded to the
     * Grid view's width controls only; cell writes keep their SQL-derived
     * eligibility.
     */
    isReadOnly?: boolean;
}

let { item, isReadOnly = false }: Props = $props();

let gridId = $state<string | undefined>();
// Bumped by Yjs observers so the $derived lookups below re-evaluate.
let registryVersion = $state(0);

let sourceError = $state<string | undefined>();

// Three creation modes: brand-new Table+Grid, new Grid over an existing Table,
// or bind to an existing Grid. The last one is the "many Grids per outline"
// side of the many-Grids-per-Table story.
let creationMode = $state<"new" | "query" | "existing-table" | "existing-grid">("new");
let selectedExistingTableId = $state<string | undefined>(undefined);
let selectedExistingGridId = $state<string | undefined>(undefined);
let selectedExistingTableSqlName = $state<string | undefined>(undefined);

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
    selectedExistingTableSqlName = existingTables.find(table => table.tableId === selectedExistingTableId)?.sqlName;
}
function showExistingGrids() {
    creationMode = "existing-grid";
    if (!selectedExistingGridId) selectedExistingGridId = existingGrids[0]?.gridId;
}

const grid = $derived.by(() => {
    void registryVersion;
    return gridId ? getGridHandles(item.ydoc, gridId) : undefined;
});

// Token for the live Grid entry's object identity: a synchronized registry
// replacement under the same Grid ID yields a fresh token, so the {#key}
// below remounts the view (and its width drafts) instead of handing the
// replacement handles to a mounted editor holding a stale draft.
const gridEntryToken = $derived.by(() => {
    void registryVersion;
    const entry = grid?.entry;
    return entry ? gridEntryTokenOf(entry) : 0;
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
const projectId = $derived(yjsStore.currentProjectId ?? undefined);
// The route name the user navigated with, the same one the sidebar links
// with. Used to point at the source Table's own page — schema and data are
// Table-owned, so the block references the Table instead of hosting it.
const routeProjectName = $derived(
    pageState.params.demoProject || pageState.params.project || undefined,
);
const sourceTableHref = $derived(
    routeProjectName && sourceTableId
        ? resolvePath(projectTablePath(routeProjectName, sourceTableId))
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
    const table = listTables(item.ydoc).find(candidate => candidate.tableId === selectedExistingTableId);
    if (!table?.sqlName) {
        sourceError = "The selected Table is no longer available. Choose an existing Table.";
        return;
    }
    if (table.sqlName !== selectedExistingTableSqlName) {
        sourceError = "The selected Table changed after selection. Select the current Table again before creating a Grid.";
        return;
    }
    const currentSqlNameError = sqlNameError(table.sqlName);
    if (currentSqlNameError) {
        sourceError = `The selected Table's current SQL name is unsuitable: ${currentSqlNameError}`;
        return;
    }
    sourceError = undefined;
    const newGridId = createGrid(item.ydoc, undefined, {
        name: table.name || "Grid",
        query: `SELECT * FROM ${table.sqlName}`,
    });
    bindItemToGrid(item, newGridId, undefined);
    gridId = newGridId;
}

function selectExistingGrid() {
    if (!selectedExistingGridId) return;
    const selectedGrid = listGrids(item.ydoc).find(candidate => candidate.gridId === selectedExistingGridId);
    if (!selectedGrid) {
        sourceError = "The selected Grid is no longer available. Choose an existing Grid.";
        return;
    }
    sourceError = undefined;
    bindItemToGrid(item, selectedGrid.gridId, undefined);
    gridId = selectedExistingGridId;
}

function createFromPreset(input: TableCreationInput): string | undefined {
    // Re-read the registry at the mutation boundary: a collaborator may have
    // claimed the draft's SQL name since the shared form last rendered.
    if (listTables(item.ydoc).some(table => table.sqlName === input.sqlName)) {
        return `SQL name "${input.sqlName}" is already used in this project`;
    }
    const { gridId: newGridId } = createTableFromPreset(
        item.ydoc,
        input.preset,
        input.name,
        input.sqlName,
    );
    bindItemToGrid(item, newGridId, undefined);
    gridId = newGridId;
    return undefined;
}

function createQueryGrid() {
    const newGridId = createGrid(item.ydoc, undefined, {
        name: "Query Grid",
        query: "SELECT 1 AS value",
    });
    bindItemToGrid(item, newGridId, undefined);
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
        {#key `${grid.gridId}::${handles.doc.guid}::${gridEntryToken}`}
            <YjsTableView
                {grid}
                {handles}
                projectDoc={item.ydoc}
                placementId={item.key}
                pageId={store.currentPage?.id || store.currentPage?.key || ""}
                pageTitle={store.currentPage?.text?.toString?.() ?? ""}
                {projectId}
                {tableName}
                sqlName={tableSqlName}
                sourceProjectId={tableSourceProjectId}
                {sourceTableHref}
                {isReadOnly}
            />
        {/key}
    {:else if grid && !sourceTableId}
        {#key `${grid.gridId}::${gridEntryToken}`}
            <ProjectGridView {grid} projectDoc={item.ydoc} {projectId} projectName={routeProjectName} {isReadOnly} />
        {/key}
    {:else if grid && !handles}
        <ProjectGridView {grid} projectDoc={item.ydoc} {projectId} projectName={routeProjectName} {isReadOnly} />
    {:else if gridId}
        <p class="loading" data-testid="yjs-table-waiting">Loading grid...</p>
    {:else}
        <div class="create-panel" data-testid="yjs-table-create-panel">
            <div class="mode-tabs">
                <button type="button" class="mode-tab" class:active={creationMode === "new"} onclick={() => creationMode = "new"}>New Table</button>
                <button type="button" class="mode-tab" class:active={creationMode === "query"} onclick={() => creationMode = "query"}>New Query Grid</button>
                {#if existingTables.length > 0}
                    <button type="button" class="mode-tab" class:active={creationMode === "existing-table"} onclick={showExistingTables}>New Grid over Existing Table</button>
                {/if}
                {#if existingGrids.length > 0}
                    <button type="button" class="mode-tab" class:active={creationMode === "existing-grid"} onclick={showExistingGrids}>Existing Grid</button>
                {/if}
            </div>

            <!-- Keep the shared form mounted while another mode is open so a
                 mode switch cannot discard a user's in-progress draft. -->
            <div hidden={creationMode !== "new"}>
                <TableCreationForm {takenSqlNames} oncreate={createFromPreset} />
            </div>
            {#if creationMode === "query"}
                <div class="create-form">
                    <button type="button" data-testid="yjs-grid-create-query" onclick={createQueryGrid}>Create Query Grid</button>
                </div>
                <p class="hint">Create an independent Grid and edit its SQL without creating a Table.</p>
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
                            selectedExistingTableSqlName = existingTables.find(
                                table => table.tableId === selectedExistingTableId,
                            )?.sqlName;
                            sourceError = undefined;
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
            {:else if creationMode === "existing-grid"}
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
                            sourceError = undefined;
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
            {#if sourceError}
                <p class="create-error" data-testid="yjs-table-source-error">{sourceError}</p>
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
