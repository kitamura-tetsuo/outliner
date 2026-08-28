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
import Loader from "../Loader.svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { isProvisionalProject } from "../../stores/store.svelte";
import { store } from "../../stores/store.svelte";
import {
    applyRename,
    deleteObject,
    generateBulkPreview,
    getDeleteImpact,
    getObjects,
    filterObjects,
    OBJECT_TYPES,
    RELATED_SELECTION_SCOPES,
    selectRelatedObjects,
    validateRename,
    type DeleteImpact,
    type NamedObject,
    type RelatedSelectionScope,
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
let relatedMenuOpen = $state(false);
let previewOpen = $state(false);
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
    previewOpen = false;
}

// Executes immediately on menu-item click rather than binding a passive
// dropdown value: "Select related" is a one-shot command, not a setting that
// silently changes the selection on some later read (issue #5135 §2). The
// full (unfiltered) object list is passed through so an object hidden by the
// current search/type filter is still discoverable and gets selected.
function applySelectRelated(scope: RelatedSelectionScope) {
    relatedMenuOpen = false;
    if (selectedObjectIds.size === 0) return;
    for (const id of selectRelatedObjects(project, objects, selectedObjectIds, scope)) {
        selectedObjectIds.add(id);
    }
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

        <!-- Always mounted at a fixed height (issue #5135 §1): selecting or
             unselecting rows only toggles which controls are disabled, never
             this element's presence, so the object table below it never
             shifts. The rename preview lives in a fixed-position popover
             (below) instead of expanding inline, for the same reason. -->
        <div class="bulk-toolbar" data-testid="object-manager-bulk-toolbar">
            <span class="bulk-count" data-testid="object-manager-selected-count">
                {selectedObjectIds.size} selected
            </span>

            <div class="select-related">
                <button
                    type="button"
                    class="btn-small"
                    onclick={() => { relatedMenuOpen = !relatedMenuOpen; }}
                    disabled={selectedObjectIds.size === 0}
                    aria-haspopup="menu"
                    aria-expanded={relatedMenuOpen}
                    data-testid="object-manager-select-related"
                >
                    Select related ▾
                </button>
                {#if relatedMenuOpen}
                    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                    <div class="menu-backdrop" onclick={() => { relatedMenuOpen = false; }}></div>
                    <div class="related-menu" role="menu" data-testid="object-manager-select-related-menu">
                        {#each RELATED_SELECTION_SCOPES as option (option.value)}
                            <button
                                type="button"
                                role="menuitem"
                                disabled={selectedObjectIds.size === 0}
                                onclick={() => applySelectRelated(option.value)}
                                data-testid={`object-manager-select-related-${option.value}`}
                            >
                                {option.label}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>

            <input
                type="text"
                bind:value={bulkFindText}
                placeholder="Find literal text"
                disabled={!hasWriteAccess || selectedObjectIds.size === 0}
                data-testid="object-manager-bulk-find"
            />
            <span>→</span>
            <input
                type="text"
                bind:value={bulkReplaceText}
                placeholder="Replace with"
                disabled={!hasWriteAccess || selectedObjectIds.size === 0}
                data-testid="object-manager-bulk-replace"
            />
            <button
                type="button"
                class="btn-small"
                onclick={() => { previewOpen = true; }}
                disabled={bulkPreview.length === 0}
                data-testid="object-manager-bulk-preview-open"
            >
                Preview
            </button>
            <button
                onclick={applyBulkRename}
                disabled={!hasWriteAccess || bulkPreview.length === 0}
                class="btn-primary"
                data-testid="object-manager-bulk-apply"
            >
                Apply Rename
            </button>
        </div>
    </div>

    {#if previewOpen && bulkPreview.length > 0}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="preview-overlay" onclick={() => { previewOpen = false; }}>
            <div
                class="bulk-preview"
                role="dialog"
                aria-modal="true"
                aria-label="Bulk rename preview"
                tabindex="-1"
                data-testid="object-manager-bulk-preview"
                onclick={(e) => e.stopPropagation()}
            >
                <h4>Preview Changes ({bulkPreview.length})</h4>
                <ul>
                    {#each bulkPreview as preview (preview.id)}
                        <li>
                            <span class="old-name">{preview.name}</span>
                            <span>→</span>
                            <span class="new-name">{preview.newName}</span>
                        </li>
                    {/each}
                </ul>
                <div class="preview-actions">
                    <button type="button" class="btn-small" onclick={() => { previewOpen = false; }}>
                        Close
                    </button>
                    <button
                        type="button"
                        class="btn-primary"
                        onclick={applyBulkRename}
                        disabled={!hasWriteAccess}
                        data-testid="object-manager-bulk-preview-apply"
                    >
                        Apply Rename
                    </button>
                </div>
            </div>
        </div>
    {/if}

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
                {#if !project || !project.ydoc || isProvisionalProject(project) || yjsStore.notYetSynced}
                    <tr>
                        <td colspan="5" class="empty-state">
                            <Loader message="Loading objects..." />
                        </td>
                    </tr>
                {:else}
                    <tr>
                        <td colspan="5" class="empty-state">No objects found matching your criteria.</td>
                    </tr>
                {/if}
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

    /* Always mounted with a fixed height (issue #5135 §1) — selecting or
       unselecting rows must never move the object table below it, so this
       toolbar's presence, height and control layout never depend on
       `selectedObjectIds.size`; only each control's `disabled` state does. */
    .bulk-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 0.625rem 1rem;
        min-height: 3rem;
    }

    .bulk-count {
        font-size: 0.8125rem;
        font-weight: 500;
        color: #374151;
        white-space: nowrap;
    }

    .select-related {
        position: relative;
    }

    .related-menu {
        position: absolute;
        top: calc(100% + 0.25rem);
        left: 0;
        /* Above the app's own fixed toolbar (z-index: 10000, Toolbar.svelte). */
        z-index: 10050;
        display: flex;
        flex-direction: column;
        min-width: 10rem;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        overflow: hidden;
    }

    .related-menu button {
        padding: 0.5rem 0.75rem;
        text-align: left;
        background: none;
        border: none;
        font-size: 0.8125rem;
        cursor: pointer;
    }

    .related-menu button:hover:not(:disabled) {
        background: #f3f4f6;
    }

    .related-menu button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .menu-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10040;
    }

    .bulk-toolbar input {
        padding: 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        flex-grow: 1;
        min-width: 8rem;
    }

    /* Fixed-position popover (issue #5135 §1): the preview never expands
       inline below the toolbar, so opening/closing it can never reflow the
       object table underneath. */
    .preview-overlay {
        position: fixed;
        inset: 0;
        /* Above the app's own fixed toolbar (z-index: 10000, Toolbar.svelte). */
        z-index: 10060;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(17, 24, 39, 0.4);
        padding: 1rem;
    }

    .bulk-preview {
        width: 100%;
        max-width: 32rem;
        max-height: 80vh;
        overflow-y: auto;
        background: white;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        padding: 1.25rem;
    }

    .bulk-preview h4 {
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.75rem;
    }

    .bulk-preview ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .bulk-preview li {
        font-size: 0.875rem;
        padding: 0.25rem 0;
        display: flex;
        gap: 1rem;
    }

    .preview-actions {
        margin-top: 1rem;
        display: flex;
        justify-content: flex-end;
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
    :global(html.dark) .bulk-toolbar input,
    :global(html.dark) .edit-input {
        background: #374151;
        border-color: #4b5563;
        color: #f9fafb;
    }

    :global(html.dark) .bulk-toolbar {
        background: #1f2937;
        border-color: #374151;
    }

    :global(html.dark) .bulk-count {
        color: #f9fafb;
    }

    :global(html.dark) .related-menu {
        background: #1f2937;
        border-color: #374151;
    }

    :global(html.dark) .related-menu button {
        color: #e5e7eb;
    }

    :global(html.dark) .related-menu button:hover:not(:disabled) {
        background: #374151;
    }

    :global(html.dark) .bulk-preview {
        background: #1f2937;
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
