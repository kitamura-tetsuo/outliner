<script lang="ts">
import { onMount } from "svelte";
import { getLogger } from "../lib/logger";
import {} from "../services";
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

type Container = {
    id: string;
    name: string;
    isDefault?: boolean;
};

let selectedContainerId = $state<string | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);

let containers = $derived.by<Array<Container>>(() => {
    const userContainer = firestoreStore.userContainer;
    if (!userContainer || !userContainer.accessibleContainerIds) {
        return [];
    }
    return userContainer.accessibleContainerIds.map((id: string) => ({
        id,
        name: id, // getProjectTitle(id),
        isDefault: false,
    }));
});
// 現在ロード中のコンテナIDを表示
let currentContainerId = $derived(fluidStore.currentContainerId);

onMount(async () => {
    // 現在のコンテナIDがある場合はそれを選択済みに
    if (currentContainerId) {
        selectedContainerId = currentContainerId;
    }
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
        // const client = await createFluidClient(currentContainerId);

        // fluidClientストアを更新
        // fluidStore.fluidClient = client;
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

.refresh-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
}

.refresh-button:hover {
    background-color: #e0e0e0;
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
