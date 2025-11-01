<script lang="ts">
import { browser } from "$app/environment";
import {
    onDestroy,
    onMount,
} from "svelte";
import { UserManager } from "../../auth/UserManager";
import AuthComponent from "../../components/AuthComponent.svelte";
import EnvDebugger from "../../components/EnvDebugger.svelte";
import NetworkErrorAlert from "../../components/NetworkErrorAlert.svelte";
import { getDebugConfig } from "../../lib/env";
import { getLogger } from "../../lib/logger";
import { yjsStore } from "../../stores/yjsStore.svelte";

import { createYjsClient } from "../../services";

const logger = getLogger();

let error: string | undefined = $state(undefined);
let debugInfo: any = $state({});
let hostInfo = $state("");
let portInfo = $state("");
let envConfig = getDebugConfig();
let isAuthenticated = $state(false);
let networkError: string | undefined = $state(undefined);
let isInitializing = $state(false);
let connectionStatus = $state("未接続");
let isConnected = $state(false);

// 認証成功時の処理
async function handleAuthSuccess(authResult: any) {
    logger.info("認証成功:", authResult);
    isAuthenticated = true;

    // 認証成功後に自動的にFluidクライアントを初期化
    await initializeFluidClient();
}

// 認証ログアウト時の処理
function handleAuthLogout() {
    logger.info("ログアウトしました");
    isAuthenticated = false;
    connectionStatus = "未接続";
    isConnected = false;
}

// Yjsクライアントの初期化
async function initializeFluidClient() {
    isInitializing = true;

    try {
        await createYjsClient();
        updateConnectionStatus();
    }
    catch (err) {
        console.error("Fluidクライアント初期化エラー:", err);
        networkError = "Fluidクライアントの初期化に失敗しました。";
    }
    finally {
        isInitializing = false;
    }
}

// ネットワークエラー発生時の再試行
async function retryConnection() {
    networkError = undefined;
    await initializeFluidClient();
}

// 接続状態の更新
function updateConnectionStatus() {
    const client = yjsStore.yjsClient as any;
    if (client) {
        connectionStatus = client.getConnectionStateString() || "未接続";
        isConnected = client.isContainerConnected || false;
        debugInfo = client.getDebugInfo();
    }
    else {
        connectionStatus = "未接続";
        isConnected = false;
    }
}

// 定期的に接続状態を更新
let statusInterval: any;

onMount(() => {
    console.debug("[debug/+page] Component mounted");

    try {
        // ホスト情報を取得 - ブラウザ環境でのみ実行
        if (browser) {
            hostInfo = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
            portInfo = window.location.port || "7070/default";
            console.info("Running on host:", hostInfo);
        }

        // UserManagerの認証状態を確認

        isAuthenticated = userManager.getCurrentUser() !== null;

        // 認証済みの場合は自動的にFluidクライアントを初期化
        if (isAuthenticated) {
            initializeFluidClient();
        }

        // 接続状態を定期的に更新（5秒ごと）
        statusInterval = setInterval(() => {
            updateConnectionStatus();
        }, 5000);
    }
    catch (err) {
        console.error("Error initializing debug page:", err);
        error = err instanceof Error
            ? err.message
            : "初期化中にエラーが発生しました。";
    }
});

onDestroy(() => {
    console.debug("[debug/+page] Component destroying");
    // 定期更新をクリア
    if (statusInterval) {
        clearInterval(statusInterval);
    }
});
</script>

<svelte:head>
    <title>Outliner Debug</title>
</svelte:head>

<main>
    <h1>Outliner Debug</h1>
    <p class="subtitle">接続テストとデバッグ情報</p>

    <!-- 認証コンポーネント -->
    <div class="auth-section">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
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
            <div class="debug-card">
                <h2>接続ステータス</h2>
                <div class="connection-status">
                    <div
                        class="
                            status-indicator {isConnected
                            ? 'connected'
                            : 'disconnected'}
                        "
                    >
                    </div>
                    <span id="connection-state-text">接続状態: {connectionStatus}</span>
                </div>

                <button onclick={initializeFluidClient} class="action-button">
                    接続テスト実行
                </button>

                <div class="status-details">
                    <p>接続URL: {hostInfo}</p>
                    <p>ポート: {portInfo}</p>
                </div>
            </div>

            <div class="debug-card">
                <h2>デバッグ情報</h2>
                <details open>
                    <summary>環境設定</summary>
                    <pre>{JSON.stringify(envConfig, null, 2)}</pre>
                </details>

                <details open>
                    <summary>Fluidクライアント</summary>
                    <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                </details>
            </div>
        </div>
    {:else}
        <!-- 未認証ユーザー向けメッセージ -->
        <div class="unauthenticated-message">
            <p>
                デバッグ機能を使用するには、上部のGoogleログインボタンからログインしてください。
            </p>
        </div>
    {/if}

    <!-- ネットワークエラー表示 -->
    <NetworkErrorAlert error={networkError} retryCallback={retryConnection} />

    <!-- 環境変数デバッガー -->
    <div class="debug-card">
        <h2>環境変数</h2>
        <EnvDebugger />
    </div>

    <div class="back-link">
        <a href="/">メインページに戻る</a>
    </div>
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
    margin-bottom: 0.5rem;
}

.subtitle {
    text-align: center;
    color: #666;
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

.debug-card {
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.debug-card h2 {
    margin-top: 0;
    color: #444;
    font-size: 1.2rem;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5rem;
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

.status-details {
    margin-top: 1rem;
    font-size: 0.9rem;
    color: #666;
}

.action-button {
    background: #2196f3;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}

.action-button:hover {
    background: #1976d2;
}

details {
    margin-top: 1rem;
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

.back-link {
    text-align: center;
    margin-top: 2rem;
}

.back-link a {
    color: #2196f3;
    text-decoration: none;
}

.back-link a:hover {
    text-decoration: underline;
}
</style>
