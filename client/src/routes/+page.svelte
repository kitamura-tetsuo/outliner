<script lang="ts">
import { goto } from "$app/navigation";
import ContainerSelector from "../components/ContainerSelector.svelte";
import { loadContainer } from "../lib/fluidService.svelte";
import { getLogger } from "../lib/logger";
import { fluidStore } from "../stores/fluidStore.svelte";

const logger = getLogger("HomePage");

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

<main class="main-content">
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

    <!-- 新規コンテナ作成リンク -->
    <div class="action-buttons">
        <a href="/containers" class="new-container-button">
            <span class="icon">+</span> 新しいアウトライナーを作成
        </a>
    </div>
</main>

<style>
main {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
}

.main-content {
    padding-top: 5rem; /* ツールバーの高さ分のパディング（余裕を持って5rem） */
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

.new-container-button .icon {
    font-size: 1.2rem;
    margin-right: 0.5rem;
}
</style>
