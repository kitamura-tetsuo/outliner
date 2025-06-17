<script lang="ts">
import { goto } from "$app/navigation";
import { onMount } from "svelte";
import ContainerSelector from "../components/ContainerSelector.svelte";
import { getLogger } from "../lib/logger";
import { loadContainer } from "../services";
import { fluidStore } from "../stores/fluidStore.svelte";

if (typeof window !== "undefined") {
    (window as any).__FLUID_STORE__ = fluidStore;
    (window as any).__SVELTE_GOTO__ = goto;
}

onMount(() => {
    (window as any).__FLUID_STORE__ = fluidStore;
    (window as any).__SVELTE_GOTO__ = goto;
});

const logger = getLogger("HomePage");

// プロジェクト作成ダイアログの状態
let isCreateProjectDialogOpen = $state(false);
let newProjectName = $state("");

// プロジェクト作成ダイアログを開く
function openCreateProjectDialog() {
    isCreateProjectDialogOpen = true;
    newProjectName = "";
}

// プロジェクト作成ダイアログを閉じる
function closeCreateProjectDialog() {
    isCreateProjectDialogOpen = false;
    newProjectName = "";
}

// 新しいプロジェクトを作成
async function createProject() {
    if (!newProjectName.trim()) return;

    try {
        // 新しいコンテナを作成
        const client = await loadContainer(""); // 新しいコンテナを作成
        fluidStore.fluidClient = client;

        // プロジェクトページに遷移
        const projectName = newProjectName.trim();
        logger.info(`Creating new project: ${projectName}`);
        closeCreateProjectDialog();
        goto(`/${projectName}`);
    }
    catch (error) {
        logger.error("Failed to create project:", error);
    }
}

// コンテナ選択時の処理
async function handleContainerSelected(
    selectedContainerId: string,
    containerName: string,
) {
    // const client = fluidStore.fluidClient;
    // if (client?.containerId === selectedContainerId) {
    //     logger.info("Selected container is already loaded");
    //     return;
    // }

    try {
        // 新しいコンテナIDで ファクトリーメソッドを使用してFluidClientを作成
        const client = await loadContainer(selectedContainerId);

        // fluidClientストアを更新
        fluidStore.fluidClient = client;

        // プロジェクトページへ遷移
        // コンテナ名をプロジェクト名として使用
        const projectName = containerName || selectedContainerId;
        logger.info(`Navigating to project page: /${projectName}`);
        goto(`/${projectName}`);
    }
    catch (error) {
        logger.error("Failed to switch container:", error);
    }
}
</script>

<svelte:head>
    <title>Fluid Outliner App</title>
</svelte:head>

<main>
    <h1>Fluid Outliner App</h1>

    <div class="welcome-message">
        <p>Fluid Outlinerへようこそ！</p>
        <p>以下のオプションから選択してください：</p>
    </div>

    <!-- コンテナセレクター -->
    <div class="container-selector">
        <h2>既存のアウトライナーを開く</h2>
        <ContainerSelector onContainerSelected={handleContainerSelected} />
    </div>

    <!-- 新規プロジェクト作成ボタン -->
    <div class="action-buttons">
        <button onclick={openCreateProjectDialog} class="create-project-button" data-testid="create-project-button">
            <span class="icon">+</span> 新しいプロジェクトを作成
        </button>
        <a href="/containers" class="new-container-button">
            <span class="icon">+</span> 新しいアウトライナーを作成
        </a>
    </div>

    <!-- プロジェクト作成ダイアログ -->
    {#if isCreateProjectDialogOpen}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <div class="mb-4 flex items-center justify-between">
                    <h2 class="text-xl font-bold">新しいプロジェクトを作成</h2>
                    <button onclick={closeCreateProjectDialog} class="text-gray-500 hover:text-gray-700">
                        ✕
                    </button>
                </div>

                <div class="mb-4">
                    <label for="project-name" class="block text-sm font-medium text-gray-700 mb-2">
                        プロジェクト名
                    </label>
                    <input
                        id="project-name"
                        type="text"
                        bind:value={newProjectName}
                        placeholder="プロジェクト名を入力"
                        class="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        data-testid="project-name-input"
                    />
                </div>

                <div class="flex justify-end space-x-3">
                    <button
                        onclick={closeCreateProjectDialog}
                        class="rounded bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400"
                    >
                        キャンセル
                    </button>
                    <button
                        onclick={createProject}
                        disabled={!newProjectName.trim()}
                        class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        data-testid="create-button"
                    >
                        作成
                    </button>
                </div>
            </div>
        </div>
    {/if}
</main>

<style>
main {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
}

h1 {
    color: #333;
    text-align: center;
    margin-bottom: 2rem;
}

h2 {
    color: #444;
    margin-bottom: 1rem;
}

.welcome-message {
    text-align: center;
    padding: 1.5rem;
    background: #f5f5f5;
    border-radius: 8px;
    margin: 2rem 0;
    color: #555;
}

.container-selector {
    margin: 2rem 0;
    padding: 1.5rem;
    background: #f9f9f9;
    border-radius: 8px;
    border: 1px solid #eee;
}

.action-buttons {
    margin: 2rem 0;
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
}

.new-container-button {
    display: inline-flex;
    align-items: center;
    background-color: #4caf50;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    text-decoration: none;
    font-weight: bold;
    transition: background-color 0.2s;
    font-size: 1.1rem;
}

.new-container-button:hover {
    background-color: #45a049;
}

.create-project-button {
    display: inline-flex;
    align-items: center;
    background-color: #2196f3;
    color: white;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    font-weight: bold;
    transition: background-color 0.2s;
    font-size: 1.1rem;
    cursor: pointer;
}

.create-project-button:hover {
    background-color: #1976d2;
}

.create-project-button .icon {
    font-size: 1.2rem;
    margin-right: 0.5rem;
}

.new-container-button .icon {
    font-size: 1.2rem;
    margin-right: 0.5rem;
}
</style>
