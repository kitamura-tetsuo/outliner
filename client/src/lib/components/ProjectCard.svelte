<script lang="ts">
    import { userManager } from "../../auth/UserManager";

    let { project, onRename, onDelete, onShare, onOpen } = $props();

    const currentUser = userManager.getCurrentUser();
    let isOwner = $derived(currentUser && project.ownerId === currentUser.id);

    function handleRename(e: Event) {
        e.stopPropagation();
        onRename?.(project);
    }

    function handleDelete(e: Event) {
        e.stopPropagation();
        onDelete?.(project);
    }

    function handleShare(e: Event) {
        e.stopPropagation();
        onShare?.(project);
    }

    function handleOpen() {
        onOpen?.(project);
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="project-card bg-white dark:bg-gray-800 shadow rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer border border-gray-200 dark:border-gray-700"
    onclick={handleOpen}
    data-testid={`project-card-${project.containerId}`}
>
    <div class="flex justify-between items-start mb-2">
        <div class="flex-1 min-w-0">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate" title={project.title}>
                {project.title}
            </h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                Last modified: {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'Unknown'}
            </p>
        </div>

        <div class="flex space-x-1 ml-4">
            {#if project.isPublic}
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Public
                </span>
            {/if}
            {#if isOwner}
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Owner
                </span>
            {:else}
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                    Shared
                </span>
            {/if}
        </div>
    </div>

    <div class="flex justify-end space-x-2 mt-4 border-t border-gray-100 dark:border-gray-700 pt-3">
        {#if onRename}
            <button
                class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm"
                onclick={handleRename}
                title="Rename"
            >
                Rename
            </button>
        {/if}
        {#if onShare}
            <button
                class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm"
                onclick={handleShare}
                title="Share"
            >
                Share
            </button>
        {/if}
        {#if onDelete}
            <button
                class="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 text-sm"
                onclick={handleDelete}
                title="Delete"
            >
                Delete
            </button>
        {/if}
    </div>
</div>
