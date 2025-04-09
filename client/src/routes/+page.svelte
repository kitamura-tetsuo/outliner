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
import MissingEnvWarning from "../components/MissingEnvWarning.svelte";
import NetworkErrorAlert from "../components/NetworkErrorAlert.svelte";
import OutlinerTree from "../components/OutlinerTree.svelte";
import PageList from "../components/PageList.svelte";
import { TreeViewManager } from "../fluid/TreeViewManager";
import { getDebugConfig } from "../lib/env";
import { getLogger } from "../lib/logger";
import { Item } from "../schema/app-schema";
import { fluidClient } from "../stores/fluidStore";

import { store } from "../stores/store.svelte";

const logger = getLogger();

let error: string | null = $state(null);
let containerId: string | null = null;
let inputText = "";
let debugInfo: any = $state({});
let showDebugPanel = $state(false);
let hostInfo = $state("");
let portInfo = $state("");
let envConfig = getDebugConfig();
let treeData: any = {};
let isAuthenticated = $state(false);
let networkError: string | null = $state(null);
let rootData; // ルートデータ（ページのコレクションを含む）
let currentPage: Item | null = $state(null); // 現在選択されているページ
let currentPageId = $state("");
let isInitializing = $state(false); // 非同期操作実行中のフラグ（必要な場合のみ使用）

// SharedTreeの変更を監視するためのハンドラ
function handleTreeChanged(event: CustomEvent) {
    treeData = event.detail.data;
    updateDebugInfo();
}

// 認証成功時の処理
async function handleAuthSuccess(authResult) {
    logger.info("認証成功:", authResult);
    isAuthenticated = true;

    // Fluidクライアントの初期化はfluidStoreが処理するため、
    // ここでは初期化せず、状態が変わるのを待つだけにする
    try {
        // fluidStoreからのクライアント状態変更を待つ
        let unsubscribe; // 明示的に変数を宣言
        unsubscribe = fluidClient.subscribe(client => {
            if (client) {
                logger.info("Fluidクライアントが接続されました");

                // containerId と rootItems を設定
                containerId = client.containerId;
                store.project = client.getProject();

                // 最初のページを選択または新規作成
                if (store.pages?.current.length) {
                    currentPage = store.pages?.current[0]; // 直接オブジェクトを代入
                    currentPageId = currentPage.id; // IDも保持（UI表示用）
                }
                else {
                    // 初期ページの作成 - TreeViewManagerを使用
                    currentPage = TreeViewManager.addPage(
                        store.project!,
                        "はじめてのページ",
                        client.currentUser?.id || "anonymous",
                    );
                    currentPageId = currentPage.id;
                }

                // ページの状態を更新
                error = null;

                // 不要になったら購読を停止
                if (unsubscribe) {
                    unsubscribe();
                }
            }
        });
    }
    catch (err) {
        console.error("認証後のFluid初期化監視エラー:", err);
        error = err instanceof Error ? err.message : "Fluid初期化エラー";

        // ネットワークエラーの場合は特別なエラーメッセージを表示
        if (err.message && err.message.includes("サーバーに接続できませんでした")) {
            networkError = "バックエンドサーバーに接続できませんでした。サーバーが起動しているか確認してください。";
        }
    }
}

// 認証ログアウト時の処理
function handleAuthLogout() {
    logger.info("ログアウトしました");
    isAuthenticated = false;
    // 必要に応じてページをリロードするか、非認証状態の表示に切り替える
}

// ページ選択時の処理
function handlePageSelect(event) {
    // 直接オブジェクトを受け取る
    currentPage = event.detail.page;
    currentPageId = event.detail.pageId; // UIで現在の選択を示すために保持
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
                await initializeFluidClient();
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

// Fluidクライアントの初期化
async function initializeFluidClient() {
    if (!$fluidClient) {
        error = "Fluidクライアントが初期化されていません。";
        return;
    }

    // コンテナIDの保存
    containerId = $fluidClient.containerId;

    // Outlinerで使用するrootItemsを設定
    rootItems = $fluidClient.getTree();

    // デバッグ情報の初期化
    updateDebugInfo();
}

// コンテナ選択時の処理
async function handleContainerSelected(selectedContainerId: string) {
    try {
        isInitializing = true;
        error = null;

        // 現在のコンテナと同じ場合は早期リターン
        if ($fluidClient?.containerId === selectedContainerId) {
            logger.info("すでに選択されているコンテナが選択されました。");
            isInitializing = false;
            return;
        }

        // 現在のFluidClientインスタンスがあれば破棄
        if ($fluidClient) {
            $fluidClient.dispose();
        }

        logger.info(`コンテナを切り替えます: ${selectedContainerId}`);

        // 新しいコンテナIDで ファクトリーメソッドを使用してFluidClientを作成
        const client = await import("../lib/fluidService").then(module => module.loadContainer(selectedContainerId));

        // fluidClientストアを更新
        fluidClient.set(client);

        // コンテナID、project、rootItems を更新
        containerId = client.containerId;
        project = client.getProject();
        rootItems = client.getTree();

        // 最初のページを選択
        if (rootItems.length > 0) {
            currentPage = rootItems[0];
            currentPageId = currentPage.id;
        }
        else {
            currentPage = null;
            currentPageId = "";
        }
    }
    catch (err) {
        console.error("コンテナ切り替えエラー:", err);
        error = err instanceof Error ? err.message : "コンテナの切り替え中にエラーが発生しました";
    }
    finally {
        isInitializing = false;
    }
}

onMount(async () => {
    console.debug("[+page] Component mounted");

    try {
        // ホスト情報を取得 - ブラウザ環境でのみ実行
        if (browser) {
            hostInfo = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
            portInfo = window.location.port || "7070/default";
            console.info("Running on host:", hostInfo);

            // SharedTreeの変更イベントをリッスン
            window.addEventListener("fluidTreeChanged", handleTreeChanged as EventListener);
        }

        // UserManagerの認証状態を確認
        const userManager = UserManager.getInstance();
        isAuthenticated = userManager.getCurrentUser() !== null;

        // 認証済みの場合はFluidクライアントの状態を監視
        if (isAuthenticated) {
            // fluidClientストアを購読
            const unsubscribe = fluidClient.subscribe(client => {
                if (client?.container) {
                    containerId = client.containerId;
                    project = client.getProject();
                    rootItems = client.getTree();
                }
            });

            // コンポーネントのクリーンアップ時に購読を解除
            return () => unsubscribe();
        }
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
        window.removeEventListener("fluidTreeChanged", handleTreeChanged as EventListener);
        delete (window as any).__FLUID_CLIENT__;
    }
});

function updateDebugInfo() {
    if ($fluidClient) {
        debugInfo = $fluidClient.getDebugInfo();
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

            {#if $fluidClient}
                <div class="content-layout">
                    <!-- ページリスト（左サイドバー） -->
                    <div class="sidebar">
                        <PageList
                            {currentPageId}
                            currentUser={$fluidClient?.currentUser?.id || "anonymous"}
                            on:select={handlePageSelect}
                        />
                    </div>

                    <!-- ページコンテンツ（右メインエリア） -->
                    <div class="main-content">
                        {#if currentPage}
                            <OutlinerTree pageItem={currentPage} />
                        {:else}
                            <div class="empty-state">
                                <p>左のサイドバーからページを選択するか、新しいページを作成してください。</p>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if $fluidClient}
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
            <div class="status-indicator {$fluidClient?.isContainerConnected ? 'connected' : 'disconnected'}"></div>
            <span>接続状態: {$fluidClient?.getConnectionStateString() || "未接続"}</span>
        </div>
        <!-- window.locationの参照を条件付きレンダリングに変更 -->
        <p class="host-info">
            {#if browser}
                Running on: {hostInfo} (Port: {portInfo})
            {:else}
                Loading host info...
            {/if}
        </p>

        <!-- 環境変数の警告 -->
        <MissingEnvWarning />

        <!-- 環境変数デバッガー -->
        <EnvDebugger />

        <!-- ネットワークエラー表示 -->
        <NetworkErrorAlert error={networkError} retryCallback={retryConnection} />
        <pre>
		{JSON.stringify($fluidClient?.getDebugInfo() || {}, null, 2)}</pre>
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

.container-info {
    background: #f0f8ff;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    border-left: 4px solid #2196f3;
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

.container-info {
    background: #f0f8ff;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    border-left: 4px solid #2196f3;
}
</style>
