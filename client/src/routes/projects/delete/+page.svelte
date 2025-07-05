<script lang="ts">
import { onMount } from "svelte";
import * as fluidService from "../../../lib/fluidService.svelte";
import { getProjectTitle } from "../../../lib/fluidService.svelte";

interface ProjectEntry {
    id: string;
    title: string;
    selected: boolean;
}

let projects: ProjectEntry[] = $state([]);
let loading = $state(false);
let error: string | undefined = $state(undefined);
let success: string | undefined = $state(undefined);

async function loadProjects() {
    loading = true;
    error = undefined;
    try {
        const { containers } = await fluidService.getUserContainers();
        projects = containers.map(id => ({ id, title: getProjectTitle(id), selected: false }));
    } catch (err) {
        error = err instanceof Error ? err.message : "プロジェクト一覧の取得に失敗しました";
    } finally {
        loading = false;
    }
}

async function deleteSelected() {
    const targets = projects.filter(p => p.selected);
    if (targets.length === 0) return;
    loading = true;
    error = undefined;
    success = undefined;
    for (const p of targets) {
        const ok = await fluidService.deleteContainer(p.id);
        if (ok) {
            projects = projects.filter(pr => pr.id !== p.id);
        } else {
            error = `削除に失敗しました: ${p.title}`;
            break;
        }
    }
    if (!error) success = "選択したプロジェクトを削除しました";
    loading = false;
}

onMount(() => {
    loadProjects();
});
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
                {#each projects as project}
                    <tr>
                        <td class="px-2 text-center">
                            <input type="checkbox" bind:checked={project.selected} />
                        </td>
                        <td class="px-2">{project.title || "(loading...)"}</td>
                        <td class="px-2">{project.id}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <button on:click={deleteSelected} disabled={loading || projects.every(p => !p.selected)} class="bg-red-500 text-white px-4 py-2 rounded">Delete</button>
    {:else}
        <p>No projects found.</p>
    {/if}
</main>

<style>
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 4px; }
</style>
