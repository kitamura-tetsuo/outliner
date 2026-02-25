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
    import { getFirebaseFunctionUrl } from "../../../lib/firebaseFunctionsUrl";
    import { userManager } from "../../../auth/UserManager";

    let currentTitle = $derived($page.params.project);
    let project = $derived(
        projectStore.projects.find((p) => p.name === currentTitle),
    );
    let isLoading = $derived(!firestoreStore.userProject);

    let newTitle = $state("");
    let error = $state("");
    let isSaving = $state(false);

    // Sharing state
    let isGeneratingLink = $state(false);
    let shareLink = $state("");
    let shareError = $state("");

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

    async function generateInvitationLink() {
        if (!project) return;
        isGeneratingLink = true;
        shareError = "";
        shareLink = "";

        try {
            const user = userManager.getCurrentUser();
            if (!user) throw new Error("Not logged in");

            const token = await userManager.auth.currentUser?.getIdToken();
            if (!token) throw new Error("Cannot get auth token");

            const url = getFirebaseFunctionUrl("generateProjectShareLink");

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    idToken: token,
                    projectId: project.id,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to generate link: ${response.status} ${text}`);
            }

            const data = await response.json();
            if (data.token) {
                // Construct the full URL using the token
                const origin = window.location.origin;
                shareLink = `${origin}/share/${data.token}`;
            } else if (data.url) {
                shareLink = data.url;
            } else {
                throw new Error("No URL returned from server");
            }

        } catch (e: any) {
            console.error("Generate link error:", e);
            shareError = e.message || "Failed to generate invitation link";
        } finally {
            isGeneratingLink = false;
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

        <div class="max-w-lg space-y-8">
            <!-- Title Section -->
            <section class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h2 class="text-xl font-semibold mb-4">Project Settings</h2>
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
            </section>

            <!-- Sharing Section -->
            <section class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h2 class="text-xl font-semibold mb-4">Sharing</h2>
                <p class="text-sm text-gray-600 mb-4">
                    Generate a link to share this project with others. Anyone with the link can join and edit the project.
                </p>

                <button
                    onclick={generateInvitationLink}
                    disabled={isGeneratingLink}
                    class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center mb-4"
                >
                    {#if isGeneratingLink}
                        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                    {:else}
                        Generate Invitation Link
                    {/if}
                </button>

                {#if shareError}
                    <div class="p-3 bg-red-50 text-red-700 rounded text-sm error">
                        {shareError}
                    </div>
                {/if}

                {#if shareLink}
                    <div class="mt-4">
                        <label for="share-link" class="block text-sm font-medium text-gray-700 mb-2">
                            Generated Link
                        </label>
                        <div class="flex">
                            <input
                                id="share-link"
                                type="text"
                                readonly
                                value={shareLink}
                                aria-label="Generated Link"
                                class="flex-1 px-3 py-2 border border-gray-300 rounded-l-md shadow-sm focus:outline-none bg-gray-50 text-gray-600"
                                onclick={(e) => (e.target as HTMLInputElement).select()}
                            />
                            <button
                                onclick={() => {
                                    navigator.clipboard.writeText(shareLink);
                                    alert("Copied to clipboard!");
                                }}
                                class="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md hover:bg-gray-200 text-gray-700"
                            >
                                Copy
                            </button>
                        </div>
                        <p class="mt-2 text-xs text-gray-500">
                            Share this link with collaborators. It expires in 24 hours.
                        </p>
                    </div>
                {/if}
            </section>
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
