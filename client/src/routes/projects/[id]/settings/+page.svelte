<script lang="ts">
    import { page } from "$app/stores";
    import { projectListStore } from "../../../../stores/projectListStore.svelte";
    import { renameProject, togglePublic, deleteProject, getProjectPublicStatus } from "../../../../services/projectService";
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { onMount } from "svelte";
    import { getLogger } from "$lib/logger";
    import { userManager } from "../../../../auth/UserManager";
    import type { ProjectMetadata } from "../../../../stores/projectListStore.svelte";
    import DeleteProjectDialog from "../../../../../components/DeleteProjectDialog.svelte";

    const logger = getLogger("ProjectSettingsPage");

    // Get containerId from route params
    let containerId = $derived($page.params.id);
    // Get project from store
    let project = $derived(projectListStore.projects[containerId]);

    let activeTab = $state("general"); // general, sharing, permissions, danger
    let isSaving = $state(false);
    let showDeleteDialog = $state(false);
    let error = $state<string | null>(null);
    let successMessage = $state<string | null>(null);

    // Form states
    let renameTitle = $state("");
    let isPublic = $state(false);
    let publicUrl = $state("");

    // Initialize states when project loads
    $effect(() => {
        if (project) {
            if (!renameTitle) renameTitle = project.title;
            if (project.isPublic !== undefined) {
                isPublic = project.isPublic;
                if (isPublic) {
                    publicUrl = `${window.location.origin}/projects/${containerId}`;
                }
            }
        }
    });

    // Check ownership
    let isOwner = $derived.by(() => {
        const currentUser = userManager.getCurrentUser();
        return currentUser && project && project.ownerId === currentUser.id;
    });

    async function handleRename() {
        if (!project) return;
        if (!renameTitle.trim()) {
            error = "Title cannot be empty";
            return;
        }

        try {
            isSaving = true;
            error = null;
            successMessage = null;
            const success = await renameProject(containerId, renameTitle);
            if (success) {
                successMessage = "Project renamed successfully";
            } else {
                error = "Failed to rename project";
            }
        } catch (e) {
            logger.error("Rename failed", e);
            error = "An error occurred";
        } finally {
            isSaving = false;
        }
    }

    async function handleTogglePublic() {
        if (!project) return;

        try {
            isSaving = true;
            error = null;
            successMessage = null;
            const newStatus = !isPublic;
            const result = await togglePublic(containerId, newStatus);
            if (result.success) {
                isPublic = newStatus;
                if (newStatus) {
                    publicUrl = `${window.location.origin}/projects/${containerId}`;
                } else {
                    publicUrl = "";
                }
                successMessage = `Project is now ${newStatus ? 'public' : 'private'}`;
            } else {
                error = "Failed to update sharing status";
            }
        } catch (e) {
            logger.error("Toggle public failed", e);
            error = "An error occurred";
        } finally {
            isSaving = false;
        }
    }

    async function handleDeleteConfirm() {
        try {
            isSaving = true;
            error = null;
            const success = await deleteProject(containerId);
            if (success) {
                goto(resolve("/projects"));
            } else {
                error = "Failed to delete project";
                isSaving = false;
            }
        } catch (e) {
            logger.error("Delete failed", e);
            error = "An error occurred";
            isSaving = false;
        } finally {
            showDeleteDialog = false;
        }
    }
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20 pb-10 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
        {#if !project}
            <div class="text-center py-12">
                <p class="text-gray-500 dark:text-gray-400">Loading project settings...</p>
                <!-- Or project not found / access denied -->
            </div>
        {:else}
            <div class="mb-8 flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    <button onclick={() => goto(resolve("/projects"))} class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        &larr; Back to Projects
                    </button>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        Settings: {project.title}
                    </h1>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden flex flex-col md:flex-row min-h-[500px]">
                <!-- Sidebar -->
                <div class="w-full md:w-64 bg-gray-50 dark:bg-gray-900/50 border-r border-gray-200 dark:border-gray-700">
                    <nav class="flex flex-col p-4 space-y-1">
                        <button
                            class={`px-4 py-2 text-left text-sm font-medium rounded-md ${activeTab === 'general' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
                            onclick={() => activeTab = 'general'}
                        >
                            General
                        </button>
                        <button
                            class={`px-4 py-2 text-left text-sm font-medium rounded-md ${activeTab === 'sharing' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
                            onclick={() => activeTab = 'sharing'}
                        >
                            Sharing
                        </button>
                        <button
                            class={`px-4 py-2 text-left text-sm font-medium rounded-md ${activeTab === 'permissions' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
                            onclick={() => activeTab = 'permissions'}
                        >
                            Permissions
                        </button>
                        <button
                            class={`px-4 py-2 text-left text-sm font-medium rounded-md ${activeTab === 'danger' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-200' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
                            onclick={() => activeTab = 'danger'}
                        >
                            Danger Zone
                        </button>
                    </nav>
                </div>

                <!-- Content -->
                <div class="flex-1 p-6 md:p-8">
                    {#if successMessage}
                        <div class="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative">
                            {successMessage}
                        </div>
                    {/if}
                    {#if error}
                        <div class="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
                            {error}
                        </div>
                    {/if}

                    {#if activeTab === 'general'}
                        <h2 class="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">General Settings</h2>

                        <div class="max-w-xl">
                            <label for="project-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project Name</label>
                            <div class="flex gap-4">
                                <input
                                    id="project-name"
                                    type="text"
                                    bind:value={renameTitle}
                                    class="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md py-2 px-3"
                                    disabled={!isOwner}
                                />
                                {#if isOwner}
                                    <button
                                        onclick={handleRename}
                                        disabled={isSaving || renameTitle === project.title}
                                        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                {/if}
                            </div>
                            {#if !isOwner}
                                <p class="mt-2 text-sm text-gray-500">Only the project owner can rename this project.</p>
                            {/if}
                        </div>
                    {/if}

                    {#if activeTab === 'sharing'}
                        <h2 class="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">Sharing Settings</h2>

                        <div class="max-w-xl space-y-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Public Access</h3>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Allow anyone with the link to view this project.</p>
                                </div>
                                <button
                                    onclick={handleTogglePublic}
                                    disabled={isSaving || !isOwner}
                                    class={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isPublic ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'} ${!isOwner ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    role="switch"
                                    aria-checked={isPublic}
                                >
                                    <span class="sr-only">Toggle public access</span>
                                    <span
                                        aria-hidden="true"
                                        class={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isPublic ? 'translate-x-5' : 'translate-x-0'}`}
                                    ></span>
                                </button>
                            </div>

                            {#if isPublic}
                                <div>
                                    <label for="public-link" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Public Link</label>
                                    <div class="flex rounded-md shadow-sm">
                                        <input
                                            id="public-link"
                                            type="text"
                                            readonly
                                            value={publicUrl}
                                            class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 sm:text-sm"
                                        />
                                        <button
                                            type="button"
                                            onclick={() => navigator.clipboard.writeText(publicUrl)}
                                            class="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-600"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}

                    {#if activeTab === 'permissions'}
                        <h2 class="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">Permissions</h2>

                        <div class="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mb-6">
                            <div class="flex">
                                <div class="flex-shrink-0">
                                    <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                    </svg>
                                </div>
                                <div class="ml-3">
                                    <p class="text-sm text-yellow-700 dark:text-yellow-200">
                                        Advanced permission management is currently under development.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="border rounded-md dark:border-gray-700 overflow-hidden">
                            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead class="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                    <tr>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {project.ownerId} (Owner)
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            Owner
                                        </td>
                                    </tr>
                                    {#if project.permissions}
                                        {#each project.permissions as perm}
                                            {#if perm.userId !== project.ownerId}
                                                <tr>
                                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                                        {perm.userId}
                                                    </td>
                                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                        {perm.role}
                                                    </td>
                                                </tr>
                                            {/if}
                                        {/each}
                                    {/if}
                                </tbody>
                            </table>
                        </div>
                    {/if}

                    {#if activeTab === 'danger'}
                        <h2 class="text-xl font-semibold mb-6 text-red-600 dark:text-red-500">Danger Zone</h2>

                        <div class="border border-red-200 dark:border-red-900 rounded-lg overflow-hidden">
                            <div class="px-6 py-4 bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-900 flex justify-between items-center">
                                <div>
                                    <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Delete Project</h3>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Permanently delete this project and all its data.</p>
                                </div>
                                <button
                                    onclick={() => showDeleteDialog = true}
                                    disabled={!isOwner}
                                    class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Delete Project
                                </button>
                            </div>
                        </div>
                        {#if !isOwner}
                             <p class="mt-2 text-sm text-gray-500 px-1">Only the project owner can delete this project.</p>
                        {/if}
                    {/if}
                </div>
            </div>
        {/if}

        {#if showDeleteDialog && project}
            <DeleteProjectDialog
                projectTitle={project.title}
                onConfirm={handleDeleteConfirm}
                onCancel={() => showDeleteDialog = false}
            />
        {/if}
    </div>
</div>
