<script lang="ts">
import { onMount } from "svelte";
import * as yjsService from "../../../lib/yjsService.svelte";
import { containerStore, type ContainerInfo } from "../../../stores/containerStore.svelte";

let selectedProjects = $state(new Set<string>());

let loading = $state(false);
let error: string | undefined = $state(undefined);
let success: string | undefined = $state(undefined);

// Mirror container store data locally so the table reacts to store updates
let containers = $state<Array<ContainerInfo>>([]);

function syncContainers(): void {
    const next = containerStore.containers;
    containers = next.length > 0 ? [...next] : [];
}

onMount(() => {
    syncContainers();

    if (typeof window === "undefined") {
        return () => {};
    }

    const onContainerStoreUpdated = () => syncContainers();
    const onFirestoreUcChanged = () => syncContainers(); // test-only fallback event

    window.addEventListener("container-store-updated", onContainerStoreUpdated);
    window.addEventListener("firestore-uc-changed", onFirestoreUcChanged);

    return () => {
        window.removeEventListener("container-store-updated", onContainerStoreUpdated);
        window.removeEventListener("firestore-uc-changed", onFirestoreUcChanged);
    };
});



async function deleteSelected() {
    const targets = containers.filter(p => selectedProjects.has(p.id));
    if (targets.length === 0) return;
    loading = true;
    error = undefined;
    success = undefined;

    let deletedCount = 0;
    for (const p of targets) {
        try {
            const ok = await yjsService.deleteContainer(p.id);
            if (ok) {
                selectedProjects.delete(p.id);
                deletedCount++;
            } else {
                error = `削除に失敗しました: ${p.name}`;
                break;
            }
        } catch (err) {
            error = `削除エラー: ${p.name} - ${err instanceof Error ? err.message : String(err)}`;
            break;
        }
    }

    if (!error && deletedCount > 0) {
        success = "選択したプロジェクトを削除しました";
        // 削除後にプロジェクトリストを更新するため、少し待ってからページをリロード
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
    {#if containers.length > 0}
        <table class="min-w-full border mb-4">
            <thead>
                <tr>
                    <th class="px-2">Select</th>
                    <th class="px-2">Title</th>
                    <th class="px-2">ID</th>
                </tr>
            </thead>
            <tbody>
                {#each containers as project (project.id)}
                    <tr>
                        <td class="px-2 text-center">
                            <input type="checkbox" checked={selectedProjects.has(project.id)} onchange={(e) => {
                                const target = e.target as HTMLInputElement;
                                if (target.checked) {
                                    selectedProjects.add(project.id);
                                } else {
                                    selectedProjects.delete(project.id);
                                }
                                // Svelteのリアクティビティのために再代入
                                selectedProjects = new Set(selectedProjects);
                            }} />
                        </td>
                        <td class="px-2">{project.name || "(loading...)"}</td>
                        <td class="px-2">{project.id}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <button onclick={deleteSelected} disabled={loading || selectedProjects.size === 0} class="bg-red-500 text-white px-4 py-2 rounded">Delete</button>
    {:else}
        <p>No projects found.</p>
    {/if}
</main>

<style>
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 4px; }
</style>
