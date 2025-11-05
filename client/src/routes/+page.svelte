<script lang="ts">
import { goto } from "$app/navigation";
import ContainerSelector from "../components/ContainerSelector.svelte";
import { getLogger } from "../lib/logger";
import { yjsStore } from "../stores/yjsStore.svelte";

// Import test helper in test environments only
if (typeof window !== "undefined" && (
    import.meta.env.MODE === "test" ||
    import.meta.env.VITE_IS_TEST === "true" ||
    process.env.NODE_ENV === "test"
)) {
    // Dynamic import to ensure test helper is available and seed default data if allowed
    import("../tests/utils/testDataHelper").then((mod) => {
        // logger.debug("Test data helper loaded"); // noise削減のため抑制
        try {
            const skip = window.localStorage.getItem("SKIP_TEST_CONTAINER_SEED") === "true";
            if (!skip && typeof mod.setupTestEnvironment === "function") {
                mod.setupTestEnvironment();
                // logger.debug("Test data helper: setupTestEnvironment called on home page"); // noise削減のため抑制
            } else if (skip) {
                // logger.debug("SKIP_TEST_CONTAINER_SEED=true; skipping default test data setup on home page"); // noise削減のため抑制
            }
        } catch (e) {
            logger.warn("Test data helper: auto-setup failed", e);
        }
    }).catch(err => {
        logger.error("Failed to load test data helper:", err);
    });
}

const logger = getLogger("HomePage");

// In test runs, redirect to lightweight test page for stability
import { onMount } from "svelte";
onMount(() => {
    const isTest = import.meta.env.MODE === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || process.env.NODE_ENV === "test";
    if (isTest) {
        // In unit tests, avoid real navigation to keep jsdom stable.
        // E2E/integration tests will handle navigation explicitly.
        return;
    }
});

// コンテナ選択時の処理
async function handleContainerSelected(
    selectedContainerId: string,
    containerName: string,
) {
    // const client = yjsStore.yjsClient;
    // if (client?.containerId === selectedContainerId) {
    //     logger.info("Selected container is already loaded");
    //     return;
    // }

    try {
        // Defer import to avoid SSR issues in test/SSR context
        const { createYjsClient } = await import("../services");
        const client = await createYjsClient(selectedContainerId);
        yjsStore.yjsClient = client as unknown;

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
    <title>Outliner</title>
</svelte:head>

<main class="main-content" data-testid="home-page">
    <h1>Outliner</h1>

    <div class="welcome-message">
        <p>Outlinerへようこそ！</p>
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
// test 1760075075
