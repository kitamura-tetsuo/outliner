<script lang="ts">
    import { onMount } from "svelte";
    import { SvelteSet } from "svelte/reactivity";
    import * as yjsService from "../../../lib/yjsService.svelte";
    import { isOnPrem } from "../../../lib/deployment";
    import { getLogger } from "../../../lib/logger";
    import {
        projectStore,
        type ProjectInfo,
    } from "../../../stores/projectStore.svelte";

    const logger = getLogger("DeleteProjectsPage");

    let selectedProjects = new SvelteSet<string>();

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
        logger.info(
            `[deleteSelected] targets=${targets.map((p) => p.id).join(",")} selected=${[...selectedProjects].join(",")}`,
        );
        if (targets.length === 0) return;
        loading = true;
        error = undefined;
        success = undefined;

        let deletedCount = 0;
        for (const p of targets) {
            try {
                logger.info(`[deleteSelected] deleting project id=${p.id} name=${p.name}`);
                const ok = await yjsService.deleteProject(p.id);
                logger.info(`[deleteSelected] result for id=${p.id}: ${ok}`);
                if (ok) {
                    selectedProjects.delete(p.id);
                    deletedCount++;
                } else {
                    error = `Failed to delete: ${p.name}`;
                    break;
                }
            } catch (err) {
                error = `Delete error: ${p.name} - ${err instanceof Error ? err.message : String(err)}`;
                logger.error({ error: err }, `[deleteSelected] exception for id=${p.id}`);
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
        loading = false;
    }
</script>

<svelte:head>
    <title>Delete Projects</title>
</svelte:head>

{#if isOnPrem}
<main class="p-4">
    <h1 class="text-2xl font-bold mb-4">Unavailable in this deployment</h1>
    <p>Project deletion is not available in on-premises deployments.</p>
</main>
{:else}<main class="p-4">
    <h1 class="text-2xl font-bold mb-4">Delete Projects</h1>

    {#if error}
        <div class="mb-2 text-red-600" data-testid="delete-error">{error}</div>
    {/if}
    {#if success}
        <div class="mb-2 text-green-600" data-testid="delete-success">{success}</div>
    {/if}
    {#if loading}
        <p data-testid="delete-loading">Loading...</p>
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
                    <tr data-testid={`delete-row-${project.id}`} data-project-id={project.id}>
                        <td class="px-2 text-center">
                            <input
                                type="checkbox"
                                data-testid={`delete-checkbox-${project.id}`}
                                checked={selectedProjects.has(project.id)}
                                onchange={(e) => {
                                    const target = e.target as HTMLInputElement;
                                    if (target.checked) {
                                        selectedProjects.add(project.id);
                                    } else {
                                        selectedProjects.delete(project.id);
                                    }
                                    // Reassign to trigger Svelte reactivity

                                }}
                            />
                        </td>
                        <td class="px-2">{project.name || "(loading...)"}</td>
                        <td class="px-2">{project.id}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <button type="button"
            data-testid="delete-selected-button"
            onclick={deleteSelected}
            disabled={loading || selectedProjects.size === 0}
            class="bg-red-500 text-white px-4 py-2 rounded">Delete</button
        >
    {:else}
        <p>No projects found.</p>
    {/if}
</main>{/if}

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
