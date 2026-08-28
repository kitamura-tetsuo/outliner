<script lang="ts">
// "Grids using this Table" — a reference list, not a dashboard.
//
// Every Grid whose `sourceTableId` is this Table is listed with enough to
// identify it and a link to its own page. Nothing is mounted eagerly: a Grid's
// result belongs on /grids/<project>/<gridId>, and rendering them all here
// would re-create the very Table->Grid conflation issue #5012 removes. An
// empty list stays empty — opening a Table never creates a Grid.

import * as Y from "yjs";
import { onDestroy, onMount } from "svelte";
import { findGridsBySourceTable, getGridRegistry } from "../../services/yjstable/gridDocs";
import { resolvePath } from "../../utils/pathUtils";
import { projectGridPath } from "../../lib/managementPaths";

interface Props {
    projectDoc: Y.Doc;
    projectName: string;
    tableId: string;
}

let { projectDoc, projectName, tableId }: Props = $props();

// Yjs -> UI mirror (AGENTS.md §11): the registry is observed and the plain
// state below is reassigned, so a Grid created elsewhere shows up here.
let grids = $state<{ gridId: string; name: string; query: string; }[]>([]);

function refresh() {
    const registry = getGridRegistry(projectDoc);
    grids = findGridsBySourceTable(projectDoc, tableId).map(entry => ({
        gridId: entry.gridId,
        name: entry.name || "Untitled grid",
        query: String(registry.get(entry.gridId)?.get("query") ?? ""),
    }));
}

const registryObserver = () => refresh();

onMount(() => {
    getGridRegistry(projectDoc).observeDeep(registryObserver);
    refresh();
});

onDestroy(() => {
    getGridRegistry(projectDoc).unobserveDeep(registryObserver);
});

function gridHref(gridId: string): string {
    return resolvePath(projectGridPath(projectName, gridId));
}

/** One line of a Grid's SELECT, enough to tell two Grids apart in a list. */
function queryPreview(query: string): string {
    const flattened = query.replace(/\s+/g, " ").trim();
    return flattened.length > 90 ? `${flattened.slice(0, 90)}…` : flattened;
}
</script>

<section class="reference-section" data-testid="table-grid-references">
    <h2 class="reference-title">Grids using this table</h2>
    {#if grids.length === 0}
        <p class="empty-state" data-testid="table-grid-references-empty">
            No grid presents this table yet. Add a grid block to a page to create one.
        </p>
    {:else}
        <ul class="reference-list">
            {#each grids as grid (grid.gridId)}
                <li class="reference-item">
                    <a class="reference-link" href={gridHref(grid.gridId)} data-grid-id={grid.gridId}>
                        {grid.name}
                    </a>
                    {#if grid.query}
                        <code class="reference-preview">{queryPreview(grid.query)}</code>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</section>

<style>
.reference-section {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 12px;
    background: white;
}

.reference-title {
    margin: 0 0 8px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #111827;
}

.empty-state {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7280;
}

.reference-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.reference-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
}

.reference-link {
    color: #2563eb;
    font-weight: 500;
    text-decoration: none;
}

.reference-link:hover {
    text-decoration: underline;
}

.reference-preview {
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: #4b5563;
    background: #f3f4f6;
    border-radius: 3px;
    padding: 1px 5px;
}
</style>
