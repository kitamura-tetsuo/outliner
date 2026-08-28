<script lang="ts">
import { onMount, tick } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import ConfirmDialog from "../ConfirmDialog.svelte";
import { isPublicProject } from "../../lib/publicProject";
import { navigateToOutlineItem } from "../../services/navigation/outlineItemNavigation";
import type { ObjectPlacement } from "../../services/objectManager/objectPlacements";
import { GRID_REGISTRY_KEY } from "../../services/yjstable/gridDocs";
import { TABLE_REGISTRY_KEY } from "../../services/yjstable/tableDocs";
import { userManager } from "../../auth/UserManager";
import { store } from "../../stores/store.svelte";
import {
    applyRename,
    deleteObject,
    generateBulkPreview,
    getDeleteImpact,
    getObjects,
    filterObjects,
    OBJECT_TYPES,
    validateRename,
    type DeleteImpact,
    type NamedObject,
} from "../../services/objectManager/objectManagerController";

interface Props {
    projectName: string;
}

let { projectName }: Props = $props();

let searchQuery = $state("");
let selectedTypes = new SvelteSet<string>(OBJECT_TYPES);
let selectedObjectIds = new SvelteSet<string>();
let bulkFindText = $state("");
let bulkReplaceText = $state("");
let editingObjectId = $state<string | null>(null);
let editNameInput = $state("");
let editError = $state<string | null>(null);
let editInputEl = $state<HTMLInputElement | undefined>(undefined);
let deleteTarget = $state<NamedObject | null>(null);
let confirmOpen = $state(false);

// Permissions (AGENTS.md §6/§2): mutating controls (rename, bulk replace,
// delete) require write access; browsing and following placement links do
// not. Demo projects stay writable for everyone, mirroring the schedules
// list's `hasWriteAccess` derivation.
let isAuthenticated = $state(!!userManager.getCurrentUser());
let isPublicDemo = $derived(isPublicProject(projectName));
let hasWriteAccess = $derived(isAuthenticated || isPublicDemo);

onMount(() => {
    // This route renders no outline page, so `navigateToOutlineItem`'s
    // "already open" shortcut (`store.currentPage`) must not carry over the
    // last outline page visited before Object Manager — otherwise a
    // placement on that same Page would be treated as already open and its
    // click would never `goto` back to it.
    store.currentPage = undefined;
    return userManager.addEventListener((result) => {
        isAuthenticated = !!result?.user;
    });
});

// Derived array of objects whenever the project changes.
const project = $derived(store.project);

// Yjs -> UI mirror (AGENTS.md §11): the object list and each Grid/Calendar's
// Page placements depend on several registries plus the outline tree, so a
// rename, create, delete or drag-drop anywhere in those must refresh it.
let objectsVersion = $state(0);
let observedProject: typeof project | undefined = undefined;
let observedTargets: { observeDeep: (f: () => void) => void; unobserveDeep: (f: () => void) => void; }[] = [];
const bump = () => { objectsVersion++; };

function attachObservers(p: typeof project) {
    if (observedProject === p) return;
    for (const target of observedTargets) target.unobserveDeep(bump);
    observedTargets = [];
    observedProject = p;
    if (!p?.ydoc) return;
    observedTargets = [
        p.ydoc.getMap(GRID_REGISTRY_KEY),
        p.ydoc.getMap(TABLE_REGISTRY_KEY),
        p.schedules,
        p.calendars,
        p.ydoc.getMap("orderedTree"),
    ];
    for (const target of observedTargets) target.observeDeep(bump);
}

onMount(() => () => attachObservers(undefined));

// Re-subscribing is folded into this derived (rather than a separate
// `$effect`, which AGENTS.md reserves for when there is no other way) since
// `objects` already depends on `project` and must recompute whenever it
// changes anyway; `attachObservers` itself is a no-op once already attached
// to the current project.
let objects: NamedObject[] = $derived.by(() => {
    attachObservers(project);
    void store.projectVersion;
    void objectsVersion;
    return getObjects(project);
});

let filteredObjects = $derived.by(() => {
    return filterObjects(objects, selectedTypes, searchQuery);
});

// Selection can include objects hidden by the current filter (selected
// before narrowing it), so "select all" state must be judged against the
// *visible* rows, not raw counts — otherwise the header checkbox can show
// checked while none of the visible rows are selected, and activating it
// clears the hidden selection instead of selecting what's shown.
let selectedFilteredCount = $derived.by(() => {
    return filteredObjects.filter(o => selectedObjectIds.has(o.id)).length;
});

let bulkPreview = $derived.by(() => {
    return generateBulkPreview(objects, selectedObjectIds, bulkFindText, bulkReplaceText);
});

let deleteImpact = $derived.by((): DeleteImpact | null => {
    return deleteTarget && project ? getDeleteImpact(project, deleteTarget) : null;
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
    if (filteredObjects.length > 0 && selectedFilteredCount === filteredObjects.length) {
        for (const o of filteredObjects) selectedObjectIds.delete(o.id);
    } else {
        filteredObjects.forEach(o => selectedObjectIds.add(o.id));
    }
}

function startEditing(object: NamedObject) {
    if (!hasWriteAccess) return;
    editingObjectId = object.id;
    editNameInput = object.name;
    editError = null;
}

function cancelEdit() {
    editingObjectId = null;
    editError = null;
}

function commitEdit() {
    if (!editingObjectId || !project) return;
    const obj = objects.find(o => o.id === editingObjectId);
    if (!obj) {
        editingObjectId = null;
        return;
    }

    const error = validateRename(project, obj.type, obj.id, editNameInput);
    if (error) {
        editError = error;
        void tick().then(() => editInputEl?.focus());
        return;
    }

    applyRename(project, obj.type, obj.id, editNameInput);
    editingObjectId = null;
    editError = null;
}

function applyBulkRename() {
    if (!project || !project.ydoc || !hasWriteAccess || bulkPreview.length === 0) return;

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

function placementLabel(placements: ObjectPlacement[], index: number): string {
    const placement = placements[index];
    const sameCount = placements.filter(p => p.pageTitle === placement.pageTitle).length;
    if (sameCount <= 1) return placement.pageTitle;
    const ordinal = placements.slice(0, index + 1).filter(p => p.pageTitle === placement.pageTitle).length;
    return `${placement.pageTitle} #${ordinal}`;
}

async function goToPlacement(placement: ObjectPlacement) {
    await navigateToOutlineItem(project, placement.itemKey);
}

function requestDelete(object: NamedObject) {
    if (!hasWriteAccess) return;
    deleteTarget = object;
    confirmOpen = true;
}

function deleteMessage(): string {
    if (!deleteTarget) return "";
    const parts: string[] = [];
    const impact = deleteImpact;
    if (deleteTarget.type === "Table" && impact?.tableDependencies) {
        const deps = impact.tableDependencies;
        if (deps.directGridReferences.length > 0 || deps.dependentGridIds.length > 0) {
            parts.push(`${deps.dependentGridIds.length} dependent Grid(s) and their outline placements will be removed.`);
        }
        if (deps.scheduledTargets.length > 0) {
            parts.push(`${deps.scheduledTargets.length} Schedule(s) targeting this Table will be deleted.`);
        }
        if (deps.indirectSqlReferences.length > 0) {
            parts.push(`${deps.indirectSqlReferences.length} other object(s) reference this Table by name and may break.`);
        }
    } else if (impact && impact.placements.length > 0) {
        const pages = [...new Set(impact.placements.map(p => p.pageTitle))];
        parts.push(`${impact.placements.length} Page placement(s) will be removed: ${pages.join(", ")}.`);
    }
    // Grid, Calendar and Schedule delete are undoable as one step (a manual
    // undo-router entry). Table delete reuses `removeTableWithPolicy`, which
    // destroys the Table's subdoc outright with no undo tracking at all, so
    // promising an undo for it would be false.
    if (deleteTarget.type !== "Table") parts.push("This can be undone.");
    return parts.join(" ");
}

function executeDelete() {
    if (!deleteTarget || !project) return;
    deleteObject(project, deleteTarget);
    selectedObjectIds.delete(deleteTarget.id);
    deleteTarget = null;
}
</script>

<svelte:head>
    <title>Objects Manager - Outliner</title>
</svelte:head>

<div class="manager-container">
    <header class="manager-header">
        <h1>Objects Manager</h1>
        <p>Manage, rename and delete objects in your project.</p>
        {#if !hasWriteAccess}
            <p class="readonly-banner" data-testid="object-manager-readonly">
                You have read-only access. You can browse objects and follow Page links, but renaming, bulk replace
                and delete are disabled.
            </p>
        {/if}
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
                {#each OBJECT_TYPES as type (type)}
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

        <p class="bulk-hint">Select one or more objects below to bulk find &amp; replace their names.</p>

        <div class="bulk-rename-panel" class:active={selectedObjectIds.size > 0}>
            <h3>Bulk Rename ({selectedObjectIds.size} selected)</h3>
            <div class="bulk-inputs">
                <input
                    type="text"
                    bind:value={bulkFindText}
                    placeholder="Find literal text"
                    disabled={!hasWriteAccess}
                    data-testid="object-manager-bulk-find"
                />
                <span>→</span>
                <input
                    type="text"
                    bind:value={bulkReplaceText}
                    placeholder="Replace with"
                    disabled={!hasWriteAccess}
                    data-testid="object-manager-bulk-replace"
                />
                <button
                    onclick={applyBulkRename}
                    disabled={!hasWriteAccess || bulkPreview.length === 0}
                    class="btn-primary"
                    data-testid="object-manager-bulk-apply"
                >
                    Apply Rename
                </button>
            </div>

            {#if bulkPreview.length > 0}
                <div class="bulk-preview" data-testid="object-manager-bulk-preview">
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
                        checked={filteredObjects.length > 0 && selectedFilteredCount === filteredObjects.length}
                        indeterminate={selectedFilteredCount > 0 && selectedFilteredCount < filteredObjects.length}
                        onchange={selectAll}
                    />
                </th>
                <th>Type</th>
                <th>Name</th>
                <th>Pages</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            {#each filteredObjects as object (object.id)}
                <tr class:selected={selectedObjectIds.has(object.id)} data-testid={`object-row-${object.id}`}>
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
                                bind:this={editInputEl}
                                bind:value={editNameInput}
                                onblur={commitEdit}
                                onkeydown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                                }}
                                autofocus
                                class="edit-input"
                                class:has-error={!!editError}
                                data-testid={`object-name-input-${object.id}`}
                            />
                            {#if editError}
                                <span class="edit-error" role="alert" data-testid={`object-name-error-${object.id}`}>
                                    {editError}
                                </span>
                            {/if}
                        {:else if hasWriteAccess}
                            <button
                                type="button"
                                class="name-button"
                                onclick={() => startEditing(object)}
                                data-testid={`object-name-${object.id}`}
                            >
                                {object.name}
                            </button>
                        {:else}
                            <span data-testid={`object-name-${object.id}`}>{object.name}</span>
                        {/if}
                    </td>
                    <td class="placements-col">
                        {#if object.placements.length === 0}
                            <span class="placements-empty">—</span>
                        {:else}
                            <div class="placement-chips">
                                {#each object.placements as placement, i (placement.itemKey)}
                                    <button
                                        type="button"
                                        class="placement-chip"
                                        data-testid={`object-placement-${placement.itemKey}`}
                                        onclick={() => goToPlacement(placement)}
                                    >
                                        {placementLabel(object.placements, i)}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </td>
                    <td>
                        <button
                            type="button"
                            class="btn-small btn-delete"
                            disabled={!hasWriteAccess}
                            title={hasWriteAccess ? undefined : "Read-only access"}
                            onclick={() => requestDelete(object)}
                            data-testid={`object-delete-${object.id}`}
                        >
                            Delete
                        </button>
                    </td>
                </tr>
            {:else}
                <tr>
                    <td colspan="5" class="empty-state">No objects found matching your criteria.</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<ConfirmDialog
    bind:isOpen={confirmOpen}
    title={deleteTarget ? `Delete ${deleteTarget.type} "${deleteTarget.name}"?` : "Delete object?"}
    message={deleteMessage()}
    confirmText="Delete"
    cancelText="Cancel"
    isDestructive
    onConfirm={executeDelete}
    onCancel={() => (deleteTarget = null)}
/>

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

    .readonly-banner {
        margin-top: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: 4px;
        background: #fef3c7;
        color: #92400e;
        font-size: 0.875rem;
    }

    .controls-bar {
        display: flex;
        flex-direction: column;
        gap: 1rem;
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

    .bulk-hint {
        margin: 0;
        font-size: 0.8125rem;
        color: #6b7280;
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
    .type-badge.calendar { background: #dcfce7; color: #166534; }
    .type-badge.schedule { background: #fef3c7; color: #92400e; }

    .name-button {
        background: none;
        border: none;
        padding: 0.125rem 0.25rem;
        margin: -0.125rem -0.25rem;
        font: inherit;
        text-align: left;
        cursor: text;
        border-radius: 4px;
    }

    .name-button:hover {
        background: #f3f4f6;
    }

    .edit-input {
        width: 100%;
        padding: 0.25rem 0.5rem;
        border: 1px solid #3b82f6;
        border-radius: 4px;
        outline: none;
    }

    .edit-input.has-error {
        border-color: #ef4444;
    }

    .edit-error {
        display: block;
        color: #ef4444;
        font-size: 0.75rem;
        margin-top: 0.25rem;
    }

    .placements-col {
        max-width: 260px;
    }

    .placements-empty {
        color: #9ca3af;
    }

    .placement-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
    }

    .placement-chip {
        padding: 0.125rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 9999px;
        background: white;
        font-size: 0.75rem;
        cursor: pointer;
        color: #1d4ed8;
    }

    .placement-chip:hover {
        background: #eff6ff;
        border-color: #93c5fd;
    }

    .btn-small {
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
        border-radius: 4px;
        border: 1px solid #d1d5db;
        background: white;
        cursor: pointer;
    }

    .btn-small:hover:not(:disabled) {
        background: #f9fafb;
    }

    .btn-small:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .btn-delete {
        color: #b91c1c;
        border-color: #fca5a5;
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

    :global(html.dark) .btn-small:hover:not(:disabled) {
        background: #4b5563;
    }

    :global(html.dark) .name-button:hover {
        background: #374151;
    }

    :global(html.dark) .placement-chip {
        background: #1f2937;
        border-color: #4b5563;
        color: #93c5fd;
    }
</style>
