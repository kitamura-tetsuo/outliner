<script lang="ts">
import { onMount } from "svelte";
import { createFluidClient } from "../lib/fluidService.svelte";
import { getLogger } from "../lib/logger";
import { containerStore } from "../stores/containerStore.svelte";
import { firestoreStore } from "../stores/firestoreStore.svelte";
import { fluidStore } from "../stores/fluidStore.svelte";
const logger = getLogger();

interface Props {
    onContainerSelected?: (
        containerId: string,
        containerName: string,
    ) => void;
}

let { onContainerSelected = () => {} }: Props = $props();

let selectedContainerId = $state<string | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);

let containers = containerStore.containers;
// 現在ロード中のコンテナIDを表示
let currentContainerId = fluidStore.currentContainerId;

// デバッグ情報をログ出力
$effect(() => {
    logger.info("ContainerSelector - containers:", containers);
    logger.info("ContainerSelector - containers length:", containers.length);
    if (containers.length > 0) {
        logger.info("ContainerSelector - first container:", containers[0]);
    }
    // firestoreStoreの状態も確認
    logger.info("ContainerSelector - firestoreStore userContainer:", firestoreStore.userContainer);
});

onMount(async () => {
    // 現在のコンテナIDがある場合はそれを選択済みに
    if (currentContainerId) {
        selectedContainerId = currentContainerId;
    }

    // 認証状態を確認
    setTimeout(async () => {
        const currentUser = (window as any).__USER_MANAGER__?.getCurrentUser();
        const authUser = (window as any).__USER_MANAGER__?.auth?.currentUser;

        logger.info("ContainerSelector - Current user:", currentUser);
        logger.info("ContainerSelector - Auth user:", authUser);

        if (!currentUser && !authUser) {
            logger.info("ContainerSelector - No user found, attempting login...");
            try {
                await (window as any).__USER_MANAGER__?.loginWithEmailPassword('test@example.com', 'password');
                logger.info("ContainerSelector - Login successful");
            } catch (err) {
                logger.error("ContainerSelector - Login failed:", err);
            }
        }
    }, 1000);
});

// コンテナ選択時の処理
async function handleContainerChange() {
    if (!selectedContainerId) return;

    try {
        isLoading = true;
        error = null;

        // 選択したコンテナの情報を取得
        const selectedContainer = containers.find(
            c => c.id === selectedContainerId,
        );
        if (!selectedContainer) {
            throw new Error("選択されたコンテナが見つかりません");
        }

        // 選択したコンテナIDとコンテナ名をイベントとして発行
        onContainerSelected(selectedContainerId, selectedContainer.name);
    }
    catch (err) {
        logger.error("コンテナ選択エラー:", err);
        error = err instanceof Error
            ? err.message
            : "コンテナの選択中にエラーが発生しました";
    }
    finally {
        isLoading = false;
    }
}

// 現在のコンテナIDのリロード
async function reloadCurrentContainer() {
    if (!currentContainerId) return;

    try {
        isLoading = true;
        error = null;

        // ファクトリーメソッドを使用して現在のコンテナを再ロード
        const client = await createFluidClient(currentContainerId);

        // fluidClientストアを更新
        fluidStore.fluidClient = client;
    }
    catch (err) {
        logger.error("コンテナ再ロードエラー:", err);
        error = err instanceof Error
            ? err.message
            : "コンテナの再ロード中にエラーが発生しました";
    }
    finally {
        isLoading = false;
    }
}
</script>

<div class="container-selector">
    <div class="selector-header">
        <h3 class="selector-title">アウトライナー選択</h3>
        {#if isLoading}
            <span class="loading-indicator">読み込み中...</span>
        {/if}
    </div>

    <!-- デバッグ情報 -->
    <div class="debug-info">
        <p>Debug Info:</p>
        <p>Containers length: {containers.length}</p>
        <p>Containers data: {JSON.stringify(containers, null, 2)}</p>
        <p>UserContainer: {JSON.stringify(firestoreStore.userContainer, null, 2)}</p>
        <button onclick={() => {
            console.log('Current user:', (window as any).__USER_MANAGER__?.getCurrentUser());
            console.log('Auth state:', (window as any).__USER_MANAGER__?.auth?.currentUser);
            console.log('Firestore userContainer:', (window as any).__FIRESTORE_STORE__?.userContainer);
        }} class="debug-button">
            Log Debug Info
        </button>
        <button onclick={async () => {
            try {
                await (window as any).__USER_MANAGER__?.loginWithEmailPassword('test@example.com', 'password');
                console.log('Manual login successful');
            } catch (err) {
                console.error('Manual login failed:', err);
            }
        }} class="debug-button">
            Manual Login
        </button>
        <button onclick={async () => {
            try {
                const response = await fetch('http://localhost:57000/createTestUserData', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: 'test-user-id',
                        defaultContainerId: 'test-container-1',
                        accessibleContainerIds: ['test-container-1', 'test-container-2']
                    })
                });
                if (response.ok) {
                    console.log('Test user data created successfully');
                } else {
                    console.error('Failed to create test user data:', await response.text());
                }
            } catch (err) {
                console.error('Error creating test user data:', err);
            }
        }} class="debug-button">
            Create Test Data
        </button>
    </div>

    {#if error}
        <div class="error-message">
            {error}
        </div>
    {/if}

    <div class="selector-content">
        <div class="select-container">
            <select
                bind:value={selectedContainerId}
                onchange={handleContainerChange}
                disabled={isLoading || containers.length === 0}
                class="container-select"
            >
                {#if containers.length === 0}
                    <option value="">利用可能なコンテナがありません</option>
                {:else}
                    {#each containers as container}
                        <option value={container.id}>
                            {container.name}
                            {container.isDefault ? "(デフォルト)" : ""}
                            {
                                container.id === currentContainerId
                                ? "(現在表示中)"
                                : ""
                            }
                        </option>
                    {/each}
                {/if}
            </select>
        </div>

        <div class="actions">
            <button
                onclick={reloadCurrentContainer}
                disabled={isLoading || !currentContainerId}
                class="reload-button"
            >
                現在のコンテナを再読み込み
            </button>

            <a href="/containers" class="new-container-link"> 新規作成 </a>
        </div>
    </div>
</div>

<style>
.container-selector {
    background-color: #f5f5f5;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
}

.selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.selector-title {
    font-size: 16px;
    font-weight: bold;
    margin: 0;
}

.loading-indicator {
    font-size: 14px;
    color: #666;
}

.debug-info {
    background-color: #e8f4f8;
    border: 1px solid #b3d9e6;
    padding: 8px;
    margin-bottom: 12px;
    font-size: 12px;
    font-family: monospace;
    border-radius: 4px;
}

.debug-button {
    background-color: #007acc;
    color: white;
    border: none;
    padding: 4px 8px;
    margin: 2px;
    border-radius: 3px;
    font-size: 10px;
    cursor: pointer;
}

.debug-button:hover {
    background-color: #005a9e;
}

.error-message {
    background-color: #fff0f0;
    border-left: 3px solid #ff6b6b;
    color: #d32f2f;
    padding: 8px 12px;
    margin-bottom: 12px;
    font-size: 14px;
}

.selector-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.select-container {
    display: flex;
    gap: 8px;
}

.container-select {
    flex-grow: 1;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #ccc;
    background-color: white;
}

.actions {
    display: flex;
    gap: 8px;
}

.reload-button {
    padding: 6px 12px;
    background-color: #e0e0e0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.reload-button:hover {
    background-color: #d0d0d0;
}

.new-container-link {
    padding: 6px 12px;
    background-color: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    text-decoration: none;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.new-container-link:hover {
    background-color: #45a049;
}
</style>
