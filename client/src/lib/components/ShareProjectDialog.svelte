<script lang="ts">
    import { togglePublic, getProjectPublicStatus } from "../../services/projectService";
    import { getLogger } from "../logger";
    import { onMount } from "svelte";

    const logger = getLogger("ShareProjectDialog");

    interface Props {
        containerId: string;
        projectTitle: string;
        onClose: () => void;
    }

    let { containerId, projectTitle, onClose } = $props();

    let isPublic = $state(false);
    let publicUrl = $state("");
    let isLoading = $state(true);
    let isSaving = $state(false);
    let error = $state<string | null>(null);

    onMount(async () => {
        try {
            const status = await getProjectPublicStatus(containerId);
            if (status) {
                isPublic = status.isPublic;
                if (status.isPublic) {
                    publicUrl = `${window.location.origin}/p/${containerId}`;
                    // Note: URL structure depends on routing. Assuming /p/{id} or similar for public access.
                    // Or maybe it's just normal access if public?
                    // The backend returns publicAccessToken. Maybe used for unauthenticated access?
                    // For now using generic URL.
                }
            }
        } catch (e) {
            logger.error("Failed to load sharing status", e);
            error = "Failed to load sharing status";
        } finally {
            isLoading = false;
        }
    });

    async function handleToggle() {
        try {
            isSaving = true;
            error = null;
            const newStatus = !isPublic;
            const result = await togglePublic(containerId, newStatus);
            if (result.success) {
                isPublic = newStatus;
                if (newStatus) {
                    publicUrl = `${window.location.origin}/projects/${containerId}`; // Use project URL for now
                } else {
                    publicUrl = "";
                }
            } else {
                error = "Failed to update sharing status";
            }
        } catch (e) {
            logger.error("Failed to toggle public status", e);
            error = "An error occurred";
        } finally {
            isSaving = false;
        }
    }

    function copyUrl() {
        if (publicUrl) {
            navigator.clipboard.writeText(publicUrl);
            // Show toast or something?
        }
    }

    // Close on backdrop click
    function handleBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }

    // Handle Esc key
    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            onClose();
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    onclick={handleBackdropClick}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    tabindex="-1"
>
    <div class="mx-4 w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
        <h2 id="dialog-title" class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Share Project
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Share "<span class="font-medium text-gray-900 dark:text-gray-100">{projectTitle}</span>" with others.
        </p>

        {#if isLoading}
            <div class="flex justify-center py-4">
                <span class="text-gray-500">Loading...</span>
            </div>
        {:else}
            <div class="mb-6">
                <div class="flex items-center justify-between mb-4">
                    <span class="text-gray-700 dark:text-gray-300 font-medium">Public Access</span>
                    <button
                        type="button"
                        onclick={handleToggle}
                        disabled={isSaving}
                        class={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isPublic ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                        role="switch"
                        aria-checked={isPublic}
                        aria-label="Toggle public access"
                    >
                        <span
                            aria-hidden="true"
                            class={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isPublic ? 'translate-x-5' : 'translate-x-0'}`}
                        ></span>
                    </button>
                </div>

                {#if isPublic}
                    <div class="mt-4">
                        <label for="public-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Public Link
                        </label>
                        <div class="flex rounded-md shadow-sm">
                            <input
                                id="public-url"
                                type="text"
                                readonly
                                value={publicUrl}
                                class="block w-full rounded-none rounded-l-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-gray-500 dark:text-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                            <button
                                type="button"
                                onclick={copyUrl}
                                class="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                Copy
                            </button>
                        </div>
                        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Anyone with this link can view this project.
                        </p>
                    </div>
                {/if}

                {#if error}
                    <p class="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
                {/if}
            </div>
        {/if}

        <div class="flex justify-end">
            <button
                type="button"
                onclick={onClose}
                class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
                Close
            </button>
        </div>
    </div>
</div>
