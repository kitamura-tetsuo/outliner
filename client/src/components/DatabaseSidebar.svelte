<script lang="ts">
// Sidebar listing the project's database tables (the Yjs table registry in
// the project doc). Reactivity follows the mirror pattern: a registry
// observer bumps a version counter that the $derived list depends on.

import { onDestroy, onMount } from "svelte";
import type * as Y from "yjs";
import { getTableRegistry, listTables, type TableRegistryEntry } from "../services/yjstable/tableDocs";
import { store } from "../stores/store.svelte";

let { isOpen = $bindable(false) } = $props();

let registryVersion = $state(0);
const registryObserver = () => {
    registryVersion++;
};

let observedDoc: Y.Doc | undefined;

function ensureObserver(doc: Y.Doc | undefined) {
    if (doc === observedDoc) return;
    if (observedDoc) getTableRegistry(observedDoc).unobserveDeep(registryObserver);
    observedDoc = doc;
    if (doc) getTableRegistry(doc).observeDeep(registryObserver);
}

onMount(() => {
    ensureObserver(store.project?.ydoc);
});

onDestroy(() => {
    ensureObserver(undefined);
});

const tables: TableRegistryEntry[] = $derived.by(() => {
    void registryVersion;
    void isOpen;
    const doc = store.project?.ydoc;
    // Re-attach when the project doc changed since mount (e.g. connected later).
    ensureObserver(doc);
    return doc ? listTables(doc) : [];
});
</script>

<aside class="sidebar" class:open={isOpen} aria-label="Database Sidebar">
    <div class="sidebar-content">
        <div class="header">
            <h2 class="sidebar-title">Databases</h2>
            <button type="button" class="close-btn" onclick={() => (isOpen = false)} aria-label="Close Database Sidebar">×</button>
        </div>

        <div class="sidebar-section">
            <h3 class="sidebar-section-title">Tables</h3>
            <ul class="table-list">
                {#if tables.length === 0}
                    <li class="sidebar-placeholder">No tables found</li>
                {:else}
                    {#each tables as table (table.tableId)}
                        <li>
                            <div class="table-item" data-table-id={table.tableId}>
                                <span class="table-name">{table.name || "Untitled table"}</span>
                            </div>
                        </li>
                    {/each}
                {/if}
            </ul>
        </div>
    </div>
</aside>

<style>
    .sidebar {
        width: 250px;
        height: calc(100vh - 4rem); /* Adjust based on toolbar height */
        position: fixed;
        right: 0; /* Place on the right */
        top: 4rem; /* Below the toolbar */
        background-color: white;
        border-left: 1px solid #e5e7eb;
        transition: transform 0.3s ease;
        overflow-y: auto;
        z-index: 9;
        transform: translateX(100%);
        box-shadow: -2px 0 5px rgba(0,0,0,0.05);
    }

    .sidebar.open {
        transform: translateX(0);
    }

    .sidebar-content {
        padding: 1rem;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .sidebar-title {
        font-size: 1.25rem;
        font-weight: bold;
        color: #1f2937;
        margin: 0;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #6b7280;
    }
    .close-btn:hover {
        color: #1f2937;
    }

    .sidebar-section-title {
        font-size: 0.875rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #4b5563;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .table-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .table-item {
        padding: 0.5rem;
        border-radius: 4px;
        background-color: #f9fafb;
        margin-bottom: 0.25rem;
        border: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        width: 100%;
        text-align: left;
    }

    .table-name {
        font-weight: 500;
        color: #111827;
        font-size: 0.875rem;
    }

    .sidebar-placeholder {
        color: #9ca3af;
        font-size: 0.875rem;
        font-style: italic;
    }
</style>
