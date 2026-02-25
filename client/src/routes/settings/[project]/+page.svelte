<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";

    import {
        setContainerTitleInMetaDoc,
    } from "../../../lib/metaDoc.svelte";
    import {
        firestoreStore,
        saveProjectIdToServer,
    } from "../../../stores/firestoreStore.svelte";
    import { projectStore } from "../../../stores/projectStore.svelte";

    let currentTitle = $derived($page.params.project);
    let project = $derived(
        projectStore.projects.find((p) => p.name === currentTitle),
    );
    let isLoading = $derived(!firestoreStore.userProject);

    let newTitle = $state("");
    let error = $state("");
    let isSaving = $state(false);

    // Initialize newTitle when currentTitle changes
    $effect(() => {
        if (currentTitle && !isSaving) {
            newTitle = currentTitle;
        }
    });

    async function saveTitle() {
        if (!project) return;
        if (!newTitle.trim()) {
            error = "Title cannot be empty";
            return;
        }
        if (newTitle === currentTitle) {
            // No change
            return;
        }

        const projectId = project.id; // Capture ID before async operation
        isSaving = true;
        error = "";

        try {
            const success = await saveProjectIdToServer(projectId, newTitle);
            if (success) {
                // Update local metadata immediately
                setContainerTitleInMetaDoc(projectId, newTitle);

                // For immediate UI feedback, the redirect will reload the page with new title in URL.
                // But if the store isn't updated, the new page might show "Project not found" if we look for newTitle.
                // Ah! This is a race condition.
                // If I redirect to /settings/NewTitle, but projectStore still has OldTitle,
                // find(p => p.name === "NewTitle") will return undefined.

                // So I must wait for the store to update?
                // Or I can update firestoreStore locally via saveProjectIdToServer's test logic?
                // saveProjectIdToServer implementation:
                // if test env -> updates local store.
                // if prod -> calls API.

                // If API succeeds, Firestore will update, listener will fire, store will update.
                // This might take a few seconds.

                // Workaround:
                // After success, I can try to manually inject the change into firestoreStore.userProject.projectTitles if possible.
                // firestoreStore.userProject is read-only? No, it has `setUserProject`.

                // However, `saveProjectIdToServer` doesn't return the new state.

                // Maybe I should stay on the page and show "Saved!" until the store updates?
                // Or just redirect and hope? Or show a spinner "Updating...".

                // Let's implement a wait loop for the store to reflect the change before redirecting.
                const checkInterval = setInterval(() => {
                   const updated = projectStore.projects.find(p => p.name === newTitle);
                   if (updated) {
                       clearInterval(checkInterval);
                       goto(`/settings/${encodeURIComponent(newTitle)}`, { replaceState: true });
                   }
                }, 100);

                // Safety timeout
                setTimeout(() => {
                    clearInterval(checkInterval);
                    // Fallback redirect
                    goto(`/settings/${encodeURIComponent(newTitle)}`, { replaceState: true });
                }, 5000);

            } else {
                error = "Failed to save project title to server.";
                isSaving = false;
            }
        } catch (e) {
            console.error(e);
            error = "An error occurred while saving.";
            isSaving = false;
        }
    }
</script>

<div class="container mx-auto px-4 py-8">
    <div class="mb-4">
        <a href="/settings" class="text-blue-600 hover:underline">&larr; Back to Settings</a>
    </div>

    {#if isLoading}
         <div class="flex justify-center py-8">
            <div class="loader">Loading...</div>
        </div>
    {:else if !project}
        <div class="p-4 bg-yellow-50 text-yellow-800 rounded">
            Project "{currentTitle}" not found.
        </div>
    {:else}
        <h1 class="text-3xl font-bold mb-8">Settings for {currentTitle}</h1>

        <div class="max-w-lg">
            <div class="mb-6">
                <label for="title" class="block text-sm font-medium text-gray-700 mb-2">
                    Project Title
                </label>
                <input
                    id="title"
                    type="text"
                    bind:value={newTitle}
                    class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    disabled={isSaving}
                />
            </div>

            {#if error}
                <div class="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
                    {error}
                </div>
            {/if}

            <button
                onclick={saveTitle}
                disabled={isSaving || !newTitle.trim()}
                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
                {#if isSaving}
                     <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                {:else}
                    Save Changes
                {/if}
            </button>
        </div>
    {/if}
</div>

<style>
    .loader {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>
