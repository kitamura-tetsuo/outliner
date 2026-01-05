<script lang="ts">
import { goto } from "$app/navigation";
import { tick } from "svelte";
import ContainerSelector from "../components/ContainerSelector.svelte";
import { getLogger } from "../lib/logger";
import * as yjsHighService from "../lib/yjsService.svelte";
import { saveContainerId } from "../stores/firestoreStore.svelte";
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
        yjsStore.yjsClient = client as any;

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

// Inline Project Creation State
let isCreating = $state(false);
let newProjectTitle = $state("");
let isLoading = $state(false);
let createError = $state("");
let inputElement = $state<HTMLInputElement>();

async function startCreate() {
    isCreating = true;
    newProjectTitle = "";
    createError = "";
    await tick();
    if (inputElement) {
        inputElement.focus();
    }
}

function cancelCreate() {
    isCreating = false;
    newProjectTitle = "";
    createError = "";
}

async function handleCreate(e?: Event) {
    if (e) e.preventDefault();
    if (!newProjectTitle.trim()) return;

    isLoading = true;
    createError = "";

    try {
        // Dispose current client if needed (similar to projects/containers/+page.svelte)
        const client = yjsStore.yjsClient as any;
        if (client) {
            client.dispose?.();
            yjsStore.yjsClient = undefined;
        }

        const newClient = await yjsHighService.createNewProject(newProjectTitle);
        const createdContainerId = newClient.containerId;
        yjsStore.yjsClient = newClient as any;

        await saveContainerId(createdContainerId);

        logger.info(`Created project: ${newProjectTitle} (${createdContainerId})`);
        goto(`/${encodeURIComponent(newProjectTitle)}`);
    } catch (e: any) {
        logger.error("Failed to create project:", e);
        createError = e.message || "Failed to create project";
    } finally {
        isLoading = false;
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
        {#if !isCreating}
            <button class="new-container-button" onclick={startCreate}>
                <span class="icon">+</span> 新しいアウトライナーを作成
            </button>
        {:else}
            <div class="creation-form" role="group" aria-label="Create new project">
                <h3>新しいアウトライナーを作成</h3>
                <form onsubmit={handleCreate}>
                    <div class="input-group">
                        <input
                            bind:this={inputElement}
                            type="text"
                            placeholder="プロジェクト名 (例: マイプロジェクト)"
                            bind:value={newProjectTitle}
                            disabled={isLoading}
                            class="project-input"
                            aria-label="Project Title"
                            required
                        />
                    </div>

                    {#if createError}
                        <div class="error-text" role="alert">
                            {createError}
                        </div>
                    {/if}

                    <div class="form-actions">
                        <button type="button" class="btn-cancel" onclick={cancelCreate} disabled={isLoading}>
                            キャンセル
                        </button>
                        <button type="submit" class="btn-create" disabled={isLoading || !newProjectTitle.trim()}>
                            {#if isLoading}
                                <span class="spin">⏳</span> 作成中...
                            {:else}
                                作成する
                            {/if}
                        </button>
                    </div>
                </form>
            </div>
        {/if}
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
    border: none;
    cursor: pointer;
}

.new-container-button:hover {
    background-color: #45a049;
}

.new-container-button .icon {
    font-size: 1.2rem;
    margin-right: 0.5rem;
}

/* Creation Form Styles */
.creation-form {
    width: 100%;
    max-width: 500px;
    background: #f9f9f9;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #eee;
    text-align: left;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.creation-form h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: #444;
    font-size: 1.2rem;
}

.input-group {
    margin-bottom: 1rem;
}

.project-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    box-sizing: border-box;
}

.project-input:focus {
    outline: none;
    border-color: #4caf50;
    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
}

.btn-cancel {
    padding: 0.75rem 1.5rem;
    background: #e0e0e0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    color: #333;
    transition: background 0.2s;
}

.btn-cancel:hover {
    background: #d0d0d0;
}

.btn-create {
    padding: 0.75rem 1.5rem;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: background 0.2s;
}

.btn-create:hover {
    background: #45a049;
}

.btn-create:disabled {
    background: #a5d6a7;
    cursor: not-allowed;
    opacity: 0.8;
}

.error-text {
    color: #d32f2f;
    margin-bottom: 1rem;
    display: block;
    background: #ffebee;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.9rem;
    border-left: 3px solid #d32f2f;
}

.spin {
    animation: spin 1s linear infinite;
    display: inline-block;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
</style>
// test 1760075075
