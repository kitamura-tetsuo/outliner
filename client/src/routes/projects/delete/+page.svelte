<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { firestoreStore } from "$stores/firestoreStore.svelte";
    import { SvelteSet } from "svelte/reactivity";

    let projects: any[] = $state([]);
    let loading = $state(true);
    let selectedProjects = new SvelteSet<string>();
    let isDeleting = $state(false);

    onMount(async () => {
        // Fetch projects owned by the user
        // This is a simplified version, usually you'd have a service for this
        if (!firestoreStore.currentUser) {
            goto("/login");
            return;
        }

        try {
            // Mock fetching projects
            // projects = await firestoreService.getOwnedProjects(firestoreStore.currentUser.uid);
            projects = []; // Placeholder
        } catch (error) {
            console.error("Failed to load projects", error);
        } finally {
            loading = false;
        }
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
        if (!confirm(`Are you sure you want to delete ${selectedProjects.size} projects? This cannot be undone.`)) return;

        isDeleting = true;
        try {
            const promises = Array.from(selectedProjects).map(id => {
                // firestoreService.deleteProject(id)
                return Promise.resolve(id);
            });
            await Promise.all(promises);

            // Remove from list
            projects = projects.filter(p => !selectedProjects.has(p.id));
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
        <a href="/" class="text-blue-500 hover:underline">&larr; Back to Dashboard</a>

        <button
            class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
            disabled={selectedProjects.size === 0 || isDeleting}
            onclick={deleteSelected}
        >
            {isDeleting ? "Deleting..." : `Delete Selected (${selectedProjects.size})`}
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
                    <th class="border border-gray-300 px-4 py-2">Created At</th>
                    <th class="border border-gray-300 px-4 py-2">Owner</th>
                </tr>
            </thead>
            <tbody>
                {#each projects as project (project.id)}
                    <tr class="hover:bg-gray-50">
                        <td class="border border-gray-300 px-4 py-2 text-center">
                            <input
                                type="checkbox"
                                checked={selectedProjects.has(project.id)}
                                onchange={() => toggleSelection(project.id)}
                            />
                        </td>
                        <td class="border border-gray-300 px-4 py-2">
                            {project.title || "(Untitled)"}
                        </td>
                        <td class="border border-gray-300 px-4 py-2 font-mono text-xs">
                            {project.id}
                        </td>
                        <td class="border border-gray-300 px-4 py-2 text-sm">
                            {project.createdAt
                                ? new Date(
                                    project.createdAt._seconds * 1000,
                                ).toLocaleString()
                                : "-"}
                        </td>
                        <td class="border border-gray-300 px-4 py-2 text-sm">
                            {project.ownerId || "-"}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else}
        <p>No projects found.</p>
    {/if}
</main>
