<script lang="ts">
import { onMount } from "svelte";
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
    if ((data as any)?.project && isAuthenticated && !fluidStore.fluidClient) {
        loadProject();
    }
});

async function loadProject() {
    try {
        const projectName = (data as any).project;

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
