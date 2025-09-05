<script lang="ts">
import { onMount } from "svelte";
import { page as pageStore } from "$app/state";
import { userManager } from "../../auth/UserManager";
import Toolbar from "../../components/Toolbar.svelte";
import { getFluidClientByProjectTitle } from "../../services";
import { fluidStore } from "../../stores/fluidStore.svelte";

// プロジェクトレベルのレイアウト
// このレイアウトは /[project] と /[project]/[page] の両方に適用されます
let { data, children } = $props();

let project: any = $state(null);
let isAuthenticated = $state(false);

// fluidStoreからプロジェクトを取得
$effect(() => {
    if (fluidStore.fluidClient) {
        project = fluidStore.fluidClient.getProject();
    }
});

// URLパラメータからプロジェクト名を取得
$effect(() => {
    // Prefer explicit param over optional data prop
    const projectParam = (pageStore?.params?.project as string) || (data as any)?.project;
    // Do not gate on isAuthenticated in tests/Yjs-only; attempt to load whenever param is present
    if (projectParam && !fluidStore.fluidClient) {
        loadProject(projectParam);
    }
});

async function loadProject(projectNameFromParam?: string) {
    try {
        const projectName = projectNameFromParam ?? (data as any).project;

        // プロジェクト名からFluidClientを取得
        const client = await getFluidClientByProjectTitle(projectName);
        if (client) {
            fluidStore.fluidClient = client;
            project = client.getProject();
        }
    } catch (err) {
        console.error("Failed to load project:", err);
    }
}

onMount(() => {
    isAuthenticated = userManager.getCurrentUser() !== null;
    // Keep it in sync when auth state changes
    try {
        userManager.addEventListener((authResult: any) => {
            isAuthenticated = authResult !== null;
            // If project not yet loaded but param exists, try again when auth flips
            const projectParam = (pageStore?.params?.project as string) || (data as any)?.project;
            if (projectParam && !fluidStore.fluidClient) {
                loadProject(projectParam);
            }
        });
    } catch {}
});
</script>

<Toolbar {project} />

<div class="main-content">
    {@render children()}
</div>

<style>
.main-content {
    padding-top: 5rem; /* ツールバーの高さ分のパディング（余裕を持って5rem） */
}
</style>
