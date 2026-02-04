<script lang="ts">
    import { onMount } from "svelte";
    import * as yjsService from "../../../lib/yjsService.svelte";
    import {
        projectStore,
        type ProjectInfo,
    } from "../../../stores/projectStore.svelte";

    let selectedProjects = $state(new Set<string>());

    let loading = $state(false);
    let error: string | undefined = $state(undefined);
    let success: string | undefined = $state(undefined);

    // Mirror project store data locally so the table reacts to store updates
    let projects = $state<Array<ProjectInfo>>([]);

    function syncProjects(): void {
        const next = projectStore.projects;
        projects = next.length > 0 ? [...next] : [];
    }

    onMount(() => {
        syncProjects();

        if (typeof window === "undefined") {
            return () => {};
        }

        const onProjectStoreUpdated = () => syncProjects();
        const onFirestoreUcChanged = () => syncProjects(); // test-only fallback event

        // Listen to new event name
        window.addEventListener("project-store-updated", onProjectStoreUpdated);
        window.addEventListener("firestore-uc-changed", onFirestoreUcChanged);

        return () => {
            window.removeEventListener(
                "project-store-updated",
                onProjectStoreUpdated,
            );
            window.removeEventListener(
                "firestore-uc-changed",
                onFirestoreUcChanged,
            );
        };
    });

    async function deleteSelected() {
        const targets = projects.filter((p) => selectedProjects.has(p.id));
        if (targets.length === 0) return;
        loading = true;
        error = undefined;
        success = undefined;

        let deletedCount = 0;
        for (const p of targets) {
            try {
                const ok = await yjsService.deleteProject(p.id);
                if (ok) {
                    selectedProjects.delete(p.id);
                    deletedCount++;
                } else {
                    error = `Failed to delete: ${p.name}`;
                    break;
                }
            } catch (err) {
                error = `Deletion error: ${p.name} - ${err instanceof Error ? err.message : String(err)}`;
                break;
            }
        }

        if (!error && deletedCount > 0) {
            success = "Selected projects have been deleted";
            // Reload the page after a short delay to update the project list after deletion
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }

        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Reassignment to trigger Svelte reactivity, not creating new reactive state
        selectedProjects = new Set(selectedProjects);
        loading = false;
    }
</script>

<svelte:head>
    <title>Delete Projects</title>
</svelte:head>

<main class="p-4">
    <h1 class="text-2xl font-bold mb-4">Delete Projects</h1>

    {#if error}
        <div class="mb-2 text-red-600">{error}</div>
    {/if}
    {#if success}
        <div class="mb-2 text-green-600">{success}</div>
    {/if}
    {#if loading}
        <p>Loading...</p>
    {/if}
    {#if projects.length > 0}
        <table class="min-w-full border mb-4">
            <thead>
                <tr>
                    <th class="px-2">Select</th>
                    <th class="px-2">Title</th>
                    <th class="px-2">ID</th>
                </tr>
            </thead>
            <tbody>
                {#each projects as project (project.id)}
                    <tr>
                        <td class="px-2 text-center">
                            <input
                                type="checkbox"
                                checked={selectedProjects.has(project.id)}
                                onchange={(e) => {
                                    const target = e.target as HTMLInputElement;
                                    if (target.checked) {
                                        selectedProjects.add(project.id);
                                    } else {
                                        selectedProjects.delete(project.id);
                                    }
                                    // Reassign to trigger Svelte reactivity
                                    selectedProjects = new Set(
                                        selectedProjects,
                                    );
                                }}
                            />
                        </td>
                        <td class="px-2">{project.name || "(loading...)"}</td>
                        <td class="px-2">{project.id}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <button
            onclick={deleteSelected}
            disabled={loading || selectedProjects.size === 0}
            class="bg-red-500 text-white px-4 py-2 rounded">Delete</button
        >
    {:else}
        <p>No projects found.</p>
    {/if}
</main>

<style>
    table {
        border-collapse: collapse;
        width: 100%;
    }
    th,
    td {
        border: 1px solid #ccc;
        padding: 4px;
    }
</style>
