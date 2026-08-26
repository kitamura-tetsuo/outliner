<script lang="ts">
import { store } from "../../../stores/store.svelte";
import {
    getObjects, filterObjects, generateBulkPreview, applyRename, type NamedObject
} from "./ObjectManagerController";

let searchQuery = $state("");
let selectedTypes = $state<Set<string>>(new Set(["Table", "Grid", "Schedule"]));
let selectedObjectIds = $state<Set<string>>(new Set());
let bulkFindText = $state("");
let bulkReplaceText = $state("");
let editingObjectId = $state<string | null>(null);
let editNameInput = $state("");

// Derived array of objects whenever the project changes.
const project = $derived(store.project);
let objects: NamedObject[] = $derived.by(() => {
    // We establish dependencies so when store project version updates, this re-runs.
    void store.projectVersion;
    return getObjects(project);
});

let filteredObjects = $derived.by(() => {
    return filterObjects(objects, selectedTypes, searchQuery);
});

let bulkPreview = $derived.by(() => {
    return generateBulkPreview(objects, selectedObjectIds, bulkFindText, bulkReplaceText);
});

function toggleType(type: string) {
    if (selectedTypes.has(type)) {
        selectedTypes.delete(type);
    } else {
        selectedTypes.add(type);
    }
}

function toggleSelection(id: string) {
    if (selectedObjectIds.has(id)) {
        selectedObjectIds.delete(id);
    } else {
        selectedObjectIds.add(id);
    }
}

function selectAll() {
    if (selectedObjectIds.size === filteredObjects.length && filteredObjects.length > 0) {
        selectedObjectIds.clear();
    } else {
        filteredObjects.forEach(o => selectedObjectIds.add(o.id));
    }
}

function startEditing(object: NamedObject) {
    editingObjectId = object.id;
    editNameInput = object.name;
}

function saveEdit() {
    if (!editingObjectId || !project || !project.ydoc) return;

    const obj = objects.find(o => o.id === editingObjectId);
    if (!obj) return;

    applyRename(project, obj.type, obj.id, editNameInput);
    editingObjectId = null;
}

function applyBulkRename() {
    if (!project || !project.ydoc || bulkPreview.length === 0) return;

    // Atomically apply changes using Y.Doc transact
    project.ydoc.transact(() => {
        for (const preview of bulkPreview) {
            applyRename(project, preview.type, preview.id, preview.newName);
        }
    });

    bulkFindText = "";
    bulkReplaceText = "";
    selectedObjectIds.clear();
}
</script>

<svelte:head>
    <title>Objects Manager - Outliner</title>
</svelte:head>

<div class="manager-container">
    <header class="manager-header">
        <h1>Objects Manager</h1>
        <p>Manage and rename objects in your project.</p>
    </header>

    <div class="controls-bar">
        <div class="search-filter">
            <input
                type="text"
                bind:value={searchQuery}
                placeholder="Search objects..."
                class="search-input"
            />
            <div class="type-filters">
                {#each ["Table", "Grid", "Schedule"] as type (type)}
                    <label class="filter-label">
                        <input
                            type="checkbox"
                            checked={selectedTypes.has(type)}
                            onchange={() => toggleType(type)}
                        />
                        {type}
                    </label>
                {/each}
            </div>
        </div>

        <div class="bulk-rename-panel" class:active={selectedObjectIds.size > 0}>
            <h3>Bulk Rename ({selectedObjectIds.size} selected)</h3>
            <div class="bulk-inputs">
                <input type="text" bind:value={bulkFindText} placeholder="Find literal text" />
                <span>→</span>
                <input type="text" bind:value={bulkReplaceText} placeholder="Replace with" />
                <button
                    onclick={applyBulkRename}
                    disabled={bulkPreview.length === 0}
                    class="btn-primary"
                >
                    Apply Rename
                </button>
            </div>

            {#if bulkPreview.length > 0}
                <div class="bulk-preview">
                    <h4>Preview Changes:</h4>
                    <ul>
                        {#each bulkPreview as preview (preview.id)}
                            <li>
                                <span class="old-name">{preview.name}</span>
                                <span>→</span>
                                <span class="new-name">{preview.newName}</span>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </div>
    </div>

    <table class="objects-table">
        <thead>
            <tr>
                <th class="checkbox-col">
                    <input
                        type="checkbox"
                        checked={filteredObjects.length > 0 && selectedObjectIds.size === filteredObjects.length}
                        indeterminate={selectedObjectIds.size > 0 && selectedObjectIds.size < filteredObjects.length}
                        onchange={selectAll}
                    />
                </th>
                <th>Type</th>
                <th>Name</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            {#each filteredObjects as object (object.id)}
                <tr class:selected={selectedObjectIds.has(object.id)}>
                    <td class="checkbox-col">
                        <input
                            type="checkbox"
                            checked={selectedObjectIds.has(object.id)}
                            onchange={() => toggleSelection(object.id)}
                        />
                    </td>
                    <td><span class="type-badge {object.type.toLowerCase()}">{object.type}</span></td>
                    <td>
                        {#if editingObjectId === object.id}
                            <!-- svelte-ignore a11y_autofocus -->
                            <input
                                type="text"
                                bind:value={editNameInput}
                                onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editingObjectId = null; }}
                                autofocus
                                class="edit-input"
                            />
                        {:else}
                            {object.name}
                        {/if}
                    </td>
                    <td>
                        {#if editingObjectId === object.id}
                            <button onclick={saveEdit} class="btn-small">Save</button>
                            <button onclick={() => editingObjectId = null} class="btn-small btn-cancel">Cancel</button>
                        {:else}
                            <button onclick={() => startEditing(object)} class="btn-small">Rename</button>
                        {/if}
                    </td>
                </tr>
            {:else}
                <tr>
                    <td colspan="4" class="empty-state">No objects found matching your criteria.</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    .manager-container {
        padding: 2rem;
        max-width: 1000px;
        margin: 0 auto;
    }

    .manager-header {
        margin-bottom: 2rem;
    }

    .manager-header h1 {
        font-size: 1.5rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }

    .manager-header p {
        color: #6b7280;
    }

    .controls-bar {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        margin-bottom: 2rem;
    }

    .search-filter {
        display: flex;
        gap: 1.5rem;
        align-items: center;
    }

    .search-input {
        padding: 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        flex-grow: 1;
        max-width: 300px;
    }

    .type-filters {
        display: flex;
        gap: 1rem;
    }

    .filter-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
    }

    .bulk-rename-panel {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 1rem;
        display: none;
    }

    .bulk-rename-panel.active {
        display: block;
    }

    .bulk-rename-panel h3 {
        font-size: 1rem;
        font-weight: 500;
        margin-bottom: 1rem;
    }

    .bulk-inputs {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .bulk-inputs input {
        padding: 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        flex-grow: 1;
    }

    .bulk-preview {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }

    .bulk-preview h4 {
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
    }

    .bulk-preview ul {
        list-style: none;
        padding: 0;
        margin: 0;
        max-height: 200px;
        overflow-y: auto;
    }

    .bulk-preview li {
        font-size: 0.875rem;
        padding: 0.25rem 0;
        display: flex;
        gap: 1rem;
    }

    .old-name {
        color: #ef4444;
        text-decoration: line-through;
    }

    .new-name {
        color: #10b981;
    }

    .objects-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        overflow: hidden;
    }

    .objects-table th, .objects-table td {
        padding: 0.75rem 1rem;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
    }

    .objects-table th {
        background: #f9fafb;
        font-weight: 500;
        font-size: 0.875rem;
        color: #374151;
    }

    .objects-table tr.selected {
        background: #eff6ff;
    }

    .checkbox-col {
        width: 40px;
        text-align: center;
    }

    .type-badge {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 500;
    }

    .type-badge.table { background: #fee2e2; color: #991b1b; }
    .type-badge.grid { background: #e0e7ff; color: #3730a3; }
    .type-badge.schedule { background: #fef3c7; color: #92400e; }

    .edit-input {
        width: 100%;
        padding: 0.25rem 0.5rem;
        border: 1px solid #3b82f6;
        border-radius: 4px;
        outline: none;
    }

    .btn-small {
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
        border-radius: 4px;
        border: 1px solid #d1d5db;
        background: white;
        cursor: pointer;
    }

    .btn-small:hover {
        background: #f9fafb;
    }

    .btn-primary {
        padding: 0.5rem 1rem;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
    }

    .btn-primary:hover:not(:disabled) {
        background: #2563eb;
    }

    .btn-primary:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }

    .btn-cancel {
        color: #ef4444;
        border-color: #fca5a5;
    }

    .empty-state {
        text-align: center;
        padding: 3rem !important;
        color: #6b7280;
        font-style: italic;
    }

    /* Dark mode styles */
    :global(html.dark) .manager-header h1 {
        color: #f9fafb;
    }

    :global(html.dark) .search-input,
    :global(html.dark) .bulk-inputs input,
    :global(html.dark) .edit-input {
        background: #374151;
        border-color: #4b5563;
        color: #f9fafb;
    }

    :global(html.dark) .bulk-rename-panel {
        background: #1f2937;
        border-color: #374151;
    }

    :global(html.dark) .bulk-rename-panel h3 {
        color: #f9fafb;
    }

    :global(html.dark) .bulk-preview {
        border-top-color: #374151;
    }

    :global(html.dark) .bulk-preview h4 {
        color: #f9fafb;
    }

    :global(html.dark) .objects-table {
        border-color: #374151;
    }

    :global(html.dark) .objects-table th,
    :global(html.dark) .objects-table td {
        border-bottom-color: #374151;
    }

    :global(html.dark) .objects-table th {
        background: #1f2937;
        color: #e5e7eb;
    }

    :global(html.dark) .objects-table tr.selected {
        background: rgba(59, 130, 246, 0.1);
    }

    :global(html.dark) .btn-small {
        background: #374151;
        border-color: #4b5563;
        color: #e5e7eb;
    }

    :global(html.dark) .btn-small:hover {
        background: #4b5563;
    }
</style>
