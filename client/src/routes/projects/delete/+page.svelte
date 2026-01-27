<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { deleteProject } from "../../../stores/firestoreStore.svelte";
    import { SvelteSet } from "svelte/reactivity";
    import { projectStore } from "../../../stores/projectStore.svelte";
    import { userManager } from "../../../auth/UserManager";

    let projects = $derived(projectStore.projects);
    let loading = $state(true);
    let selectedProjects = new SvelteSet<string>();
    let isDeleting = $state(false);

    onMount(async () => {
        if (!userManager.getCurrentUser()) {
            // Wait for auth
            let retries = 0;
            while (!userManager.getCurrentUser() && retries < 50) {
                await new Promise((r) => setTimeout(r, 100));
                retries++;
            }
        }
        if (!userManager.getCurrentUser()) {
            goto("/login");
            return;
        }

        // Wait for projects to be loaded in store
        let retries = 0;
        while (projectStore.projects.length === 0 && retries < 50) {
            await new Promise((r) => setTimeout(r, 100));
            retries++;
        }
        loading = false;
    });

    function toggleSelection(projectId: string) {
        if (selectedProjects.has(projectId)) {
            selectedProjects.delete(projectId);
        } else {
            selectedProjects.add(projectId);
        }
    }

    async function deleteSelected() {
        if (selectedProjects.size === 0) return;
        const isE2E =
            typeof window !== "undefined" && (window as any).__E2E__ === true;
        if (
            !isE2E &&
            !confirm(
                `Are you sure you want to delete ${selectedProjects.size} projects? This cannot be undone.`,
            )
        )
            return;

        isDeleting = true;
        try {
            const promises = Array.from(selectedProjects).map((id) => {
                return deleteProject(id);
            });
            const results = await Promise.all(promises);

            if (results.some((r) => !r)) {
                alert("Some projects could not be deleted.");
            }

            selectedProjects.clear();
        } catch (error) {
            console.error("Failed to delete projects", error);
            alert("Failed to delete some projects.");
        } finally {
            isDeleting = false;
        }
    }
</script>

<main class="p-8 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold mb-6 text-red-600">Delete Projects</h1>

    <div class="mb-4 flex justify-between items-center">
        <a href="/" class="text-blue-500 hover:underline"
            >&larr; Back to Dashboard</a
        >

        <button
            class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
            disabled={selectedProjects.size === 0 || isDeleting}
            onclick={deleteSelected}
        >
            {isDeleting
                ? "Deleting..."
                : `Delete Selected (${selectedProjects.size})`}
        </button>
    </div>

    {#if loading}
        <p>Loading projects...</p>
    {:else if projects.length > 0}
        <table class="w-full border-collapse border border-gray-300">
            <thead>
                <tr class="bg-gray-100">
                    <th class="border border-gray-300 px-4 py-2 w-12">
                        <!-- Select All Checkbox could go here -->
                    </th>
                    <th class="border border-gray-300 px-4 py-2">Title</th>
                    <th class="border border-gray-300 px-4 py-2">ID</th>
                </tr>
            </thead>
            <tbody>
                {#each projects as project (project.id)}
                    <tr class="hover:bg-gray-50">
                        <td
                            class="border border-gray-300 px-4 py-2 text-center"
                        >
                            <input
                                type="checkbox"
                                checked={selectedProjects.has(project.id)}
                                onchange={() => toggleSelection(project.id)}
                            />
                        </td>
                        <td class="border border-gray-300 px-4 py-2">
                            {project.name || "(Untitled)"}
                        </td>
                        <td
                            class="border border-gray-300 px-4 py-2 font-mono text-xs"
                        >
                            {project.id}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else}
        <p>No projects found.</p>
    {/if}
</main>
