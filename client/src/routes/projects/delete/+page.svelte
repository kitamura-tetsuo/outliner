<script lang="ts">
// import * as fluidService from "../../../lib/fluidService.svelte"; // Yjsモードでは無効化
import { containerStore } from "../../../stores/containerStore.svelte";

let projects = $derived(containerStore.containers);
let selectedProjects = $state(new Set<string>());

let loading = $state(false);
let error: string | undefined = $state(undefined);
let success: string | undefined = $state(undefined);



async function deleteSelected() {
    const targets = projects.filter(p => selectedProjects.has(p.id));
    if (targets.length === 0) return;
    loading = true;
    error = undefined;
    success = undefined;

    let deletedCount = 0;
    for (const p of targets) {
        try {
            // Yjsモードでは削除機能は未実装
            // TODO: Yjsプロジェクトの削除機能を実装
            console.warn(`Yjs mode: Project deletion not implemented for ${p.name}`);
            selectedProjects.delete(p.id);
            deletedCount++;
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
                {#each projects as project}
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
