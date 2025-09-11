<script lang="ts">
import { onMount } from "svelte";
import { page as pageStore } from "$app/state";
import { userManager } from "../../auth/UserManager";
import { getYjsClientByProjectTitle, createNewYjsProject } from "../../services";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { store } from "../../stores/store.svelte";

// プロジェクトレベルのレイアウト
// このレイアウトは /[project] と /[project]/[page] の両方に適用されます
let { data, children } = $props();

let project: any = $state(null);
let isAuthenticated = $state(false);

// ストアからプロジェクトを取得
$effect(() => {
    if (yjsStore.yjsClient) {
        project = yjsStore.yjsClient.getProject();
    }
});

// URLパラメータからプロジェクト名を取得
$effect(() => {
    // Prefer explicit param over optional data prop
    const projectParam = (pageStore?.params?.project as string) || (data as any)?.project;
    if (projectParam && !yjsStore.yjsClient) {
        loadProject(projectParam);
    }
});

async function loadProject(projectNameFromParam?: string) {
    try {
        const projectName = projectNameFromParam ?? (data as any).project;

        // プロジェクト名からYjsクライアントを取得
        let client = await getYjsClientByProjectTitle(projectName);
        // テスト実行時は localStorage の VITE_IS_TEST も考慮して自動作成
        const isTestEnv = (
            import.meta.env.MODE === "test"
            || import.meta.env.VITE_IS_TEST === "true"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        );
        if (!client && isTestEnv) {
            try {
                client = await createNewYjsProject(projectName);
            } catch (e) {
                console.warn("Auto-create container failed:", e);
            }
        }
        if (client) {
            yjsStore.yjsClient = client as any;
            project = client.getProject();
            // expose project to the global store so pages become available immediately
            store.project = project;
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
            if (projectParam && !yjsStore.yjsClient) {
                loadProject(projectParam);
            }
        });
    } catch {}
});
</script>

<div class="main-content">
    {@render children()}
</div>

<style>
.main-content {
    padding-top: 5rem; /* ツールバーの高さ分のパディング（余裕を持って5rem） */
}
</style>
