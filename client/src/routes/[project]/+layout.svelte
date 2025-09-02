<script lang="ts">
import { onMount } from "svelte";
import { userManager } from "../../auth/UserManager";
import Toolbar from "../../components/Toolbar.svelte";
// import { getFluidClientByProjectTitle } from "../../services"; // Yjsモードでは無効化
// import { fluidStore } from "../../stores/fluidStore.svelte"; // Yjsモードでは無効化

// プロジェクトレベルのレイアウト
// このレイアウトは /[project] と /[project]/[page] の両方に適用されます
let { data, children } = $props();

let project: any = $state(null);
let isAuthenticated = $state(false);

// Yjsモードでは簡易プロジェクト情報を使用
$effect(() => {
    const projectName = (data as any)?.project;
    if (projectName) {
        project = {
            title: projectName,
            id: projectName,
        };
    }
});

// Yjsモードでは追加の読み込み処理は不要
async function loadProject() {
    // Yjsモードでは何もしない
    console.log("Yjs mode: No additional project loading needed");
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
