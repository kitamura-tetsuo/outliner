<script lang="ts">
    import { renameProject } from "../../services/projectService";
    import { getLogger } from "../logger";

    const logger = getLogger("RenameProjectDialog");

    let { containerId, currentTitle, onClose, onSuccess } = $props();

    let newTitle = $state(currentTitle);
    let isSubmitting = $state(false);
    let error = $state<string | null>(null);

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

    async function handleSubmit() {
        if (!newTitle.trim()) {
            error = "Title cannot be empty";
            return;
        }

        if (newTitle === currentTitle) {
            onClose();
            return;
        }

        try {
            isSubmitting = true;
            error = null;
            const success = await renameProject(containerId, newTitle);
            if (success) {
                onSuccess?.(newTitle);
                onClose();
            } else {
                error = "Failed to rename project";
            }
        } catch (e) {
            logger.error("Failed to rename project", e);
            error = "An error occurred while renaming";
        } finally {
            isSubmitting = false;
        }
    }
</script>

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
            Rename Project
        </h2>

        <div class="mb-6">
            <label for="project-title" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project Title
            </label>
            <input
                id="project-title"
                type="text"
                bind:value={newTitle}
                class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Enter new title"
                disabled={isSubmitting}
            />
            {#if error}
                <p class="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            {/if}
        </div>

        <div class="flex justify-end space-x-3">
            <button
                type="button"
                onclick={onClose}
                disabled={isSubmitting}
                class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
                Cancel
            </button>
            <button
                type="button"
                onclick={handleSubmit}
                disabled={isSubmitting || !newTitle.trim()}
                class="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSubmitting ? "Renaming..." : "Rename"}
            </button>
        </div>
    </div>
</div>
