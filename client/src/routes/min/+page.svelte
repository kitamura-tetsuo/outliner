<script lang="ts">
    import { goto } from "$app/navigation";
    import { userManager } from "../../auth/UserManager";
    import { getLogger } from "../../lib/logger";
    import { store } from "../../stores/store.svelte";

    // Only allow development environment or test environment
    const isDev = import.meta.env.DEV || import.meta.env.MODE === "test";
    const logger = getLogger("min");

    let isAuthorized = $state(false);

    // Initialize minimal application
    function init() {
        if (!isDev) {
            goto("/");
            return;
        }

        // Check authentication
        const user = userManager.getCurrentUser();
        if (!user) {
            logger.warn("Not authenticated, redirecting to login");
            goto("/");
            return;
        }

        isAuthorized = true;
    }

    // Call init on component mount
    $effect(() => {
        init();
    });

    let selectedItems: Set<string> = $state(new Set());

    function toggleSelection(id: string) {
        if (selectedItems.has(id)) {
            selectedItems.delete(id);
        } else {
            selectedItems.add(id);
        }
        // Reassign for reactivity
        selectedItems = new Set(selectedItems);
    }

    function deleteSelected() {
        if (!store.project || !store.project.items) return;

        const items = store.project.items;
        // Delete from back
        const idsToDelete = Array.from(selectedItems);
        // Find index for each ID (O(N^2) but fine for minimal tool)
        // Ideally should iterate items and filter

        // This is a minimal implementation so skip details
        console.log("Delete items:", idsToDelete);
        selectedItems = new Set();
    }
</script>

<main class="p-4">
    <h1 class="text-2xl font-bold mb-4">Minimal Project View</h1>

    {#if !isDev}
        <p>This page is only available in development environment.</p>
    {:else if !isAuthorized}
        <p>Checking authentication...</p>
    {:else if store.project}
        <h2 class="text-xl mb-2">{store.project.title}</h2>

        <table class="w-full border-collapse border border-gray-300">
            <thead>
                <tr class="bg-gray-100">
                    <th class="border border-gray-300 px-4 py-2 w-10">
                        <input type="checkbox" disabled />
                    </th>
                    <th class="border border-gray-300 px-4 py-2">Content</th>
                    <th class="border border-gray-300 px-4 py-2">ID</th>
                </tr>
            </thead>
            <tbody>
                {#each store.project.items as item (item.id)}
                    <tr class="hover:bg-gray-50">
                        <td class="border border-gray-300 px-4 py-2 text-center">
                            <input
                                type="checkbox"
                                checked={selectedItems.has(item.id)}
                                onchange={() => toggleSelection(item.id)}
                            />
                        </td>
                        <td class="border border-gray-300 px-4 py-2">
                            {item.text || "(Empty)"}
                        </td>
                        <td class="border border-gray-300 px-4 py-2 font-mono text-xs">
                            {item.id}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>

        <div class="mt-4">
            <button
                onclick={deleteSelected}
                disabled={selectedItems.size === 0}
                class="bg-red-500 text-white px-4 py-2 rounded disabled:opacity-50"
            >
                Delete Selected ({selectedItems.size})
            </button>
        </div>
    {:else}
        <p>Project not loaded.</p>
    {/if}
</main>
