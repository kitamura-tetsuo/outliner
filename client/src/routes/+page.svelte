<script lang="ts">
import { goto } from "$app/navigation";
import ContainerSelector from "../components/ContainerSelector.svelte";
import { getLogger } from "../lib/logger";
import { YjsProjectManager } from "../lib/yjsProjectManager.svelte";

// Import test helper in test environments only
if (typeof window !== "undefined" && (
    import.meta.env.MODE === "test" ||
    import.meta.env.VITE_IS_TEST === "true" ||
    process.env.NODE_ENV === "test"
)) {
    // Dynamic import to ensure test helper is available
    import("../tests/utils/testDataHelper").then(() => {
        console.log("Test data helper loaded");
    }).catch(err => {
        console.error("Failed to load test data helper:", err);
    });
}

const logger = getLogger("HomePage");

// プロジェクト選択時の処理
async function handleContainerSelected(
    selectedContainerId: string,
    containerName: string,
) {
    try {
        // Yjsプロジェクトマネージャーを作成
        const yjsProjectManager = new YjsProjectManager(selectedContainerId);
        await yjsProjectManager.connect(containerName);

        // プロジェクトページへ遷移
        // コンテナ名をプロジェクト名として使用
        const projectName = containerName || selectedContainerId;
        logger.info(`Navigating to project page: /${projectName}`);
        goto(`/${projectName}`);
    }
    catch (error) {
        logger.error("Failed to switch project:", error);
    }
}
</script>

<svelte:head>
    <title>Yjs Outliner App</title>
</svelte:head>

<main class="main-content">
    <h1>Yjs Outliner App</h1>

    <div class="welcome-message">
        <p>Yjs Outlinerへようこそ！</p>
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
