<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { onMount } from "svelte";
import { getLogger } from "../../../lib/logger";

const logger = getLogger("SharedProject");

// URLパラメータを取得
let shareId = $state("");
let isLoading = $state(true);
let error: string | null = $state(null);
let projectData: any = $state(null);

// URLパラメータを監視して更新
$effect(() => {
    if ($page.params.id) {
        shareId = $page.params.id;
        loadSharedProject();
    }
});

// 共有プロジェクトを読み込み
async function loadSharedProject() {
    if (!shareId) return;
    
    isLoading = true;
    error = null;
    
    try {
        // 実際の実装では、APIを呼び出して共有プロジェクトを取得
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // モックデータ
        projectData = {
            id: shareId,
            name: "Shared Test Project",
            permission: "readonly", // readonly, edit, admin
            owner: "project-owner@example.com",
            sharedAt: new Date().toISOString(),
        };
        
        logger.info("Shared project loaded:", projectData);
    } catch (err) {
        logger.error("Failed to load shared project:", err);
        error = "共有プロジェクトの読み込みに失敗しました";
    } finally {
        isLoading = false;
    }
}

// プロジェクトページに移動
function goToProject() {
    if (projectData) {
        goto(`/${projectData.name}`);
    }
}

onMount(() => {
    // テスト環境での初期化
    if (typeof window !== "undefined" && (window as any).__TEST_MODE__) {
        logger.info("Test mode detected for shared project");
    }
});
</script>

<svelte:head>
    <title>共有プロジェクト | Fluid Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
    {#if isLoading}
        <div class="flex items-center justify-center py-12">
            <div class="loader"></div>
            <span class="ml-3 text-gray-600">共有プロジェクトを読み込み中...</span>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">
                        エラーが発生しました
                    </h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                </div>
            </div>
        </div>
    {:else if projectData}
        <div class="rounded-lg bg-white p-6 shadow-md" data-testid="shared-project-indicator">
            <div class="mb-4 flex items-center justify-between">
                <h1 class="text-2xl font-bold text-gray-900">
                    {projectData.name}
                </h1>
                <div class="flex items-center space-x-2">
                    {#if projectData.permission === "readonly"}
                        <span class="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800" data-testid="readonly-indicator">
                            読み取り専用
                        </span>
                    {:else if projectData.permission === "edit"}
                        <span class="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                            編集可能
                        </span>
                    {:else if projectData.permission === "admin"}
                        <span class="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                            管理者
                        </span>
                    {/if}
                </div>
            </div>
            
            <div class="mb-6 text-sm text-gray-600">
                <p>所有者: {projectData.owner}</p>
                <p>共有日時: {new Date(projectData.sharedAt).toLocaleString()}</p>
            </div>
            
            <div class="space-y-4" data-testid="project-content">
                <p class="text-gray-700">
                    このプロジェクトは共有されています。以下のボタンからプロジェクトにアクセスできます。
                </p>
                
                <div class="flex space-x-3">
                    <button
                        onclick={goToProject}
                        class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
                        data-testid="access-project-button"
                    >
                        プロジェクトにアクセス
                    </button>
                    
                    {#if projectData.permission === "readonly"}
                        <button
                            disabled
                            class="rounded bg-gray-300 px-4 py-2 text-gray-500 cursor-not-allowed"
                            data-testid="edit-button"
                        >
                            編集（読み取り専用）
                        </button>
                    {:else}
                        <button
                            onclick={goToProject}
                            class="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
                            data-testid="edit-button"
                        >
                            編集
                        </button>
                    {/if}
                </div>
            </div>
        </div>
    {:else}
        <div class="rounded-md bg-gray-50 p-4">
            <p class="text-gray-700">共有プロジェクトが見つかりませんでした。</p>
        </div>
    {/if}
</main>

<style>
.loader {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>
