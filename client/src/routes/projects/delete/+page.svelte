<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { userManager } from "../../../auth/UserManager";
    import AuthComponent from "../../../components/AuthComponent.svelte";
    import { deleteProject, listProjects } from "../../../lib/yjsService.svelte";

    let projects: any[] = $state([]);
    let loading = $state(true);
    let selectedProjects: Set<string> = $state(new Set());
    let error: string | null = $state(null);
    let message: string | null = $state(null);

    // Process on auth success
    async function handleAuthSuccess(authResult: any) {
        console.log("Authentication successful:", authResult);
        await loadProjects();
    }

    async function loadProjects() {
        loading = true;
        error = null;
        try {
            projects = await listProjects();
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function deleteSelected() {
        if (
            !confirm(
                `Are you sure you want to delete ${selectedProjects.size} projects? This cannot be undone.`,
            )
        ) {
            return;
        }

        loading = true;
        message = null;
        error = null;
        const toDelete = Array.from(selectedProjects);
        let deletedCount = 0;

        for (const projectId of toDelete) {
            try {
                await deleteProject(projectId);
                deletedCount++;
            } catch (e: any) {
                console.error(`Failed to delete project ${projectId}:`, e);
                error =
                    `Failed to delete some projects. Error: ${e.message}`;
            }
        }

        message = `Deleted ${deletedCount} projects.`;
        selectedProjects = new Set();
        await loadProjects();
    }

    function toggleSelection(projectId: string) {
        if (selectedProjects.has(projectId)) {
            selectedProjects.delete(projectId);
        } else {
            selectedProjects.add(projectId);
        }
        // Reassign for Svelte reactivity
        selectedProjects = new Set(selectedProjects);
    }

    onMount(() => {
        // If already authenticated, load projects
        if (userManager.getCurrentUser()) {
            loadProjects();
        }
    });
</script>

<main class="p-4">
    <h1 class="text-2xl font-bold mb-4">Delete Projects</h1>

    <div class="mb-4">
        <AuthComponent onAuthSuccess={handleAuthSuccess} />
    </div>

    {#if error}
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
        </div>
    {/if}

    {#if message}
        <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {message}
        </div>
    {/if}

    <div class="mb-4">
        <button
            onclick={loadProjects}
            disabled={loading}
            class="bg-blue-500 text-white px-4 py-2 rounded mr-2"
        >
            Refresh List
        </button>
        <button
            onclick={deleteSelected}
            disabled={loading || selectedProjects.size === 0}
            class="bg-red-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
            Delete Selected ({selectedProjects.size})
        </button>
    </div>

    {#if loading}
        <p>Loading...</p>
    {:else if projects.length > 0}
        <table class="w-full border-collapse border border-gray-300">
            <thead>
                <tr class="bg-gray-100">
                    <th class="border border-gray-300 px-4 py-2 w-10">
                        <input
                            type="checkbox"
                            onchange={(e) => {
                                if (e.currentTarget.checked) {
                                    selectedProjects = new Set(
                                        projects.map((p) => p.id),
                                    );
                                } else {
                                    selectedProjects = new Set();
                                }
                            }}
                            checked={selectedProjects.size === projects.length &&
                                projects.length > 0}
                        />
                    </th>
                    <th class="border border-gray-300 px-4 py-2">Name</th>
                    <th class="border border-gray-300 px-4 py-2">ID</th>
                    <th class="border border-gray-300 px-4 py-2">Created At</th>
                    <th class="border border-gray-300 px-4 py-2">Owner</th>
                </tr>
            </thead>
            <tbody>
                {#each projects as project}
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
