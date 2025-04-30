<script lang="ts">
import { browser } from "$app/environment";
import {
    onDestroy,
    onMount,
} from "svelte";
import { UserManager } from "../auth/UserManager";
import AuthComponent from "../components/AuthComponent.svelte";
import ContainerSelector from "../components/ContainerSelector.svelte";
import EnvDebugger from "../components/EnvDebugger.svelte";
import NetworkErrorAlert from "../components/NetworkErrorAlert.svelte";
import PageList from "../components/PageList.svelte";
import { getDebugConfig } from "../lib/env";
import { getLogger } from "../lib/logger";
import { fluidStore } from "../stores/fluidStore.svelte";

import OutlinerBase from "../components/OutlinerBase.svelte";
import {
    createFluidClient,
    loadContainer,
} from "../services";
import { store } from "../stores/store.svelte";

const logger = getLogger();

let error: string | null = $state(null);
let project: any = $state(null);
let rootItems: any = $state(null);
let debugInfo: any = $state({});
let showDebugPanel = $state(false);
let hostInfo = $state("");
let portInfo = $state("");
let envConfig = getDebugConfig();
let isAuthenticated = $state(false);
let networkError: string | null = $state(null);
let isInitializing = $state(false); // 非同期操作実行中のフラグ（必要な場合のみ使用）

$effect(() => {
    if (isAuthenticated) {
        const client = fluidStore.fluidClient;
        if (client?.container) {
            project = client.getProject();
            rootItems = client.getTree();
        }
    }
});

// 認証成功時の処理
async function handleAuthSuccess(authResult: any) {
    logger.info("認証成功:", authResult);
    isAuthenticated = true;
}

// 認証ログアウト時の処理
function handleAuthLogout() {
    logger.info("ログアウトしました");
    isAuthenticated = false;
    // 必要に応じてページをリロードするか、非認証状態の表示に切り替える
}

// ネットワークエラー発生時の再試行
async function retryConnection() {
    networkError = null;
    isInitializing = true;

    try {
        // UserManagerインスタンスを取得して再接続
        const userManager = UserManager.getInstance();
        const currentUser = userManager.getCurrentUser();

        if (currentUser) {
            // 認証状態を更新
            const authToken = await userManager.refreshToken();
            if (authToken) {
                await createFluidClient();
            }
        }
    }
    catch (err) {
        console.error("再接続エラー:", err);
        networkError = "再接続に失敗しました。しばらくしてからもう一度お試しください。";
    }
    finally {
        isInitializing = false;
    }
}

// コンテナ選択時の処理
async function handleContainerSelected(selectedContainerId: string) {
    const client = fluidStore.fluidClient;
    if (client?.containerId === selectedContainerId) {
        logger.info("Selected container is already loaded");
        return;
    }

    try {
        // 新しいコンテナIDで ファクトリーメソッドを使用してFluidClientを作成
        const client = await loadContainer(selectedContainerId);

        // fluidClientストアを更新
        fluidStore.fluidClient = client;
    }
    catch (error) {
        console.error("Failed to switch container:", error);
    }
}

onMount(() => {
    console.debug("[+page] Component mounted");

    try {
        // ホスト情報を取得 - ブラウザ環境でのみ実行
        if (browser) {
            hostInfo = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
            portInfo = window.location.port || "7070/default";
            console.info("Running on host:", hostInfo);
        }

        // UserManagerの認証状態を確認
        const userManager = UserManager.getInstance();
        isAuthenticated = userManager.getCurrentUser() !== null;
    }
    catch (err) {
        console.error("Error initializing page:", err);
        error = err instanceof Error ? err.message : "初期化中にエラーが発生しました。";
    }
});

onDestroy(() => {
    console.debug("[+page] Component destroying");
    // イベントリスナーのクリーンアップ
    if (browser && window) {
        delete (window as any).__FLUID_CLIENT__;
    }
});

function updateDebugInfo() {
    const client = fluidStore.fluidClient;
    if (client) {
        debugInfo = client.getDebugInfo();
    }
}

function toggleDebugPanel() {
    showDebugPanel = !showDebugPanel;
    updateDebugInfo();
}
</script>

<svelte:head>
    <title>Fluid Outliner App</title>
</svelte:head>

<main>
    <h1>Fluid Outliner App</h1>
    <!-- 認証コンポーネント -->
    <div class="auth-section">
        <AuthComponent onAuthSuccess={handleAuthSuccess} onAuthLogout={handleAuthLogout} />
    </div>

    {#if isInitializing}
        <div class="loading">読み込み中...</div>
    {:else if error}
        <div class="error">
            <p>エラー: {error}</p>
            <button onclick={() => location.reload()}>再読み込み</button>
        </div>
    {:else if isAuthenticated}
        <!-- 認証済みユーザー向けコンテンツ -->
        <div class="authenticated-content">
            <!-- コンテナセレクター -->
            <ContainerSelector onContainerSelected={handleContainerSelected} />

            <!-- 新規コンテナ作成リンク -->
            <div class="action-buttons">
                <a href="/containers" class="new-container-button">
                    <span class="icon">+</span> 新しいアウトライナーを作成
                </a>
            </div>

            {#if fluidStore.fluidClient}
                <div class="content-layout">
                    <!-- ページリスト（左サイドバー） -->
                    <div class="sidebar">
                        <PageList
                            currentUser={fluidStore.currentUser?.id || "anonymous"}
                            project={store.project!}
                            rootItems={store.pages!.current}
                        />
                    </div>

                    <!-- ページコンテンツ（右メインエリア） -->
                    <div class="main-content">
                        {#if store.currentPage}
                            <!-- OutlinerBase コンポーネントでアウトライナーを表示 -->
                            <OutlinerBase pageItem={store.currentPage!} isReadOnly={false} />
                        {:else}
                            <div class="empty-state">
                                <p>ページを選択するか、新しいページを作成してください。</p>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if fluidStore.fluidClient}
                <div class="loading">
                    <p>データを読み込んでいます...</p>
                </div>
            {:else}
                <div class="loading">
                    <p>Fluidクライアントを初期化しています...</p>
                </div>
            {/if}
        </div>
    {:else}
        <!-- 未認証ユーザー向けメッセージ -->
        <div class="unauthenticated-message">
            <p>Outlinerアプリを使用するには、上部のGoogleログインボタンからログインしてください。</p>
            <p>ログインすると、リアルタイムでの共同編集が可能になります。</p>
        </div>
    {/if}

    <button onclick={toggleDebugPanel} class="mt-4 rounded bg-purple-500 p-2 text-white">
        {showDebugPanel ? "Hide" : "Show"} Debug
    </button>

    <button onclick={updateDebugInfo} class="ml-2 mt-4 rounded bg-blue-500 p-2 text-white">
        Update Debug
    </button>

    {#if showDebugPanel}
        <!-- 既存のデバッグパネル -->
        <div class="debug-panel mt-4 rounded border bg-gray-50 p-4">
            <h3>Debug Info (VSCode)</h3>
            <div class="mt-2 text-left text-xs">
                <details>
                    <summary>環境設定</summary>
                    <pre>{JSON.stringify(envConfig, null, 2)}</pre>
                </details>
                <details open>
                    <summary>Fluidクライアント</summary>
                    <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                </details>
            </div>
            <p class="mt-2 text-xs">
                VSCodeでデバッグするには:<br />
                1. F5キーでデバッグを開始<br />
                2. コンソールで<code>window.__FLUID_CLIENT__</code>にアクセス
            </p>
        </div>
    {/if}

    <!-- デバッグ情報 -->
    <details>
        <summary>デバッグ情報</summary>

        <div class="connection-status">
            <div class="status-indicator {fluidStore.fluidClient?.isContainerConnected ? 'connected' : 'disconnected'}">
            </div>
            <span>接続状態: {fluidStore.fluidClient?.getConnectionStateString() || "未接続"}</span>
        </div>
        <!-- window.locationの参照を条件付きレンダリングに変更 -->
        <p class="host-info">
            {#if browser}
                Running on: {hostInfo} (Port: {portInfo})
            {:else}
                Loading host info...
            {/if}
        </p>

        <!-- 環境変数デバッガー -->
        <EnvDebugger />

        <!-- ネットワークエラー表示 -->
        <NetworkErrorAlert error={networkError} retryCallback={retryConnection} />
        <pre>
		{JSON.stringify(fluidStore.fluidClient?.getDebugInfo() || {}, null, 2)}</pre>
    </details>
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

.loading {
    text-align: center;
    padding: 2rem;
    color: #666;
}

.error {
    background: #fff0f0;
    border: 1px solid #ffcccc;
    color: #d32f2f;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
}

.connection-status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background: #f5f5f5;
    border-radius: 4px;
}

.status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
}

.connected {
    background: #4caf50;
}

.disconnected {
    background: #f44336;
}

code {
    font-family: monospace;
    background: #eee;
    padding: 2px 4px;
    border-radius: 3px;
}

details {
    margin-top: 2rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.5rem;
}

summary {
    cursor: pointer;
    padding: 0.5rem;
    font-weight: bold;
}

pre {
    background: #f5f5f5;
    padding: 1rem;
    overflow: auto;
    border-radius: 4px;
    font-size: 12px;
}

.host-info {
    font-size: 0.8em;
    color: #666;
    margin-bottom: 1em;
}

.auth-section {
    max-width: 400px;
    margin: 0 auto 2rem auto;
}

.unauthenticated-message {
    text-align: center;
    padding: 2rem;
    background: #f5f5f5;
    border-radius: 8px;
    margin: 2rem 0;
    color: #555;
}

.authenticated-content {
    margin-top: 2rem;
}

.content-layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 20px;
    margin-top: 20px;
}

.sidebar {
    background: #fafafa;
    border-radius: 6px;
}

.main-content {
    min-height: 500px;
}

.empty-state {
    background: #f5f5f5;
    padding: 30px;
    border-radius: 6px;
    text-align: center;
    color: #666;
}

.action-buttons {
    margin: 1rem 0;
    display: flex;
    justify-content: center;
}

.new-container-button {
    display: inline-flex;
    align-items: center;
    background-color: #4caf50;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    text-decoration: none;
    font-weight: bold;
    transition: background-color 0.2s;
}

.new-container-button:hover {
    background-color: #45a049;
}

.new-container-button .icon {
    font-size: 1.2rem;
    margin-right: 0.5rem;
}
</style>
