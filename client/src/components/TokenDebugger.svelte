<script lang="ts">
import { onMount } from "svelte";
import { UserManager } from "../auth/UserManager";
import { decodeJwt } from "../lib/tokenDebugger";

let tokenInfo: any = $state(null);
let userManager: UserManager;
let isLoading = $state(false);
let error = $state("");
let tenantId = $state("");
let documentId = $state("");
let customDocumentId = $state("");
let containerId = $state("");
let customContainerId = $state("");

onMount(() => {
    userManager = UserManager.getInstance();
    loadTokenInfo();
});

// トークン情報を読み込む
async function loadTokenInfo() {
    try {
        isLoading = true;
        error = "";

        const fluidToken = userManager.getCurrentFluidToken();
        if (!fluidToken) {
            error = "トークンが見つかりません。ログインしてください。";
            return;
        }

        // テナントIDを取得
        tenantId = (fluidToken as any).tenantId || import.meta.env.VITE_AZURE_TENANT_ID || "-";

        // ドキュメントIDを取得
        documentId = fluidToken.documentId || "なし (全ドキュメントへのアクセス)";

        // コンテナIDを取得
        containerId = fluidToken.containerId || "なし (全コンテナへのアクセス)";

        // トークンをデコード
        tokenInfo = decodeJwt(fluidToken.token);
    }
    catch (err) {
        console.error("Token debugging error:", err);
        error = err.message || "トークン情報の取得に失敗しました";
    }
    finally {
        isLoading = false;
    }
}

// トークンを更新
async function refreshToken() {
    try {
        isLoading = true;
        error = "";

        await userManager.refreshToken();
        await loadTokenInfo();
    }
    catch (err) {
        console.error("Token refresh error:", err);
        error = err.message || "トークンの更新に失敗しました";
    }
    finally {
        isLoading = false;
    }
}

// 特定のドキュメント用のトークンを更新
async function refreshTokenForDocument() {
    try {
        isLoading = true;
        error = "";

        if (!customDocumentId) {
            error = "ドキュメントIDを入力してください";
            isLoading = false;
            return;
        }

        await userManager.refreshToken(customDocumentId);
        await loadTokenInfo();
        customDocumentId = ""; // フォームをクリア
    }
    catch (err) {
        console.error("Token refresh error:", err);
        error = err.message || "トークンの更新に失敗しました";
    }
    finally {
        isLoading = false;
    }
}

// 特定のコンテナ用のトークンを更新
async function refreshTokenForContainer() {
    try {
        isLoading = true;
        error = "";

        if (!customContainerId) {
            error = "コンテナIDを入力してください";
            isLoading = false;
            return;
        }

        await userManager.refreshToken(customContainerId);
        await loadTokenInfo();
        customContainerId = ""; // フォームをクリア
    }
    catch (err) {
        console.error("Token refresh error:", err);
        error = err.message || "トークンの更新に失敗しました";
    }
    finally {
        isLoading = false;
    }
}
</script>

<div class="token-debugger">
    <h3>Fluid Relay トークン情報</h3>

    <div class="controls">
        <button onclick={loadTokenInfo} disabled={isLoading}>情報を更新</button>
        <button onclick={refreshToken} disabled={isLoading}>トークンを再取得</button>
    </div>

    <div class="document-token-section">
        <h4>ドキュメント固有のトークン発行</h4>
        <div class="document-form">
            <input
                type="text"
                placeholder="ドキュメントIDを入力"
                bind:value={customDocumentId}
                disabled={isLoading}
            />
            <button onclick={refreshTokenForDocument} disabled={isLoading || !customDocumentId}>
                トークン取得
            </button>
        </div>
    </div>

    <div class="document-token-section">
        <h4>特定コンテナ用のトークン発行</h4>
        <div class="document-form">
            <input
                type="text"
                placeholder="コンテナIDを入力"
                bind:value={customContainerId}
                disabled={isLoading}
            />
            <button onclick={refreshTokenForContainer} disabled={isLoading || !customContainerId}>
                トークン取得
            </button>
        </div>
    </div>

    {#if isLoading}
        <div class="loading">読み込み中...</div>
    {:else if error}
        <div class="error">{error}</div>
    {:else if tokenInfo}
        <div class="token-info">
            {#if tokenInfo.error}
                <div class="error">{tokenInfo.error}</div>
            {:else}
                <div class="section">
                    <h4>ヘッダー</h4>
                    <pre>{JSON.stringify(tokenInfo.header, null, 2)}</pre>
                </div>
                <div class="section">
                    <h4>ペイロード</h4>
                    <pre>{JSON.stringify(tokenInfo.payload, null, 2)}</pre>
                </div>
                <div class="token-meta">
                    <div>
                        <strong>発行日時:</strong> {tokenInfo.payload.iatFormatted || "N/A"}
                    </div>
                    <div>
                        <strong>有効期限:</strong> {tokenInfo.payload.expFormatted || "N/A"}
                    </div>
                </div>
                <div class="section">
                    <h4>テナントID情報</h4>
                    <div class="tenant-info">
                        <p>
                            <strong>環境変数のテナントID:</strong> {import.meta.env.VITE_AZURE_TENANT_ID || "なし"}
                        </p>
                        <p><strong>サーバーから受け取ったテナントID:</strong> {tenantId}</p>
                        <p>
                            <strong>トークン内のテナントID:</strong>
                            {tokenInfo.payload.tenantId || tokenInfo.payload.aud || "なし"}
                        </p>
                    </div>
                </div>
                <div class="section">
                    <h4>ドキュメント情報</h4>
                    <div class="tenant-info">
                        <p><strong>現在のドキュメントID:</strong> {documentId}</p>
                        <p>
                            <strong>トークン内のドキュメントID:</strong> {tokenInfo.payload.documentId || "なし"}
                        </p>
                    </div>
                </div>
                <div class="section">
                    <h4>コンテナ情報</h4>
                    <div class="tenant-info">
                        <p><strong>現在のコンテナID:</strong> {containerId}</p>
                        <p>
                            <strong>トークン内のコンテナID:</strong> {tokenInfo.payload.containerId || "なし"}
                        </p>
                    </div>
                </div>
            {/if}
        </div>
    {:else}
        <div class="no-token">トークン情報がありません</div>
    {/if}
</div>

<style>
.token-debugger {
    background-color: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 1rem;
    margin: 1rem 0;
}

h3 {
    margin-top: 0;
    color: #343a40;
}

h4 {
    margin: 0.5rem 0;
    color: #495057;
}

.controls {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
}

button {
    background-color: #4263eb;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.875rem;
}

button:hover {
    background-color: #3b5bdb;
}

button:disabled {
    background-color: #adb5bd;
    cursor: not-allowed;
}

.loading {
    color: #495057;
    font-style: italic;
}

.error {
    color: #e03131;
    padding: 0.5rem;
    background-color: #fff5f5;
    border-radius: 4px;
}

.section {
    margin-bottom: 1rem;
}

pre {
    background-color: #f1f3f5;
    padding: 0.75rem;
    border-radius: 4px;
    overflow: auto;
    font-size: 0.75rem;
}

.token-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.875rem;
}

.no-token {
    color: #868e96;
    font-style: italic;
}

.tenant-info {
    background-color: #e6f7ff;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    margin-bottom: 1rem;
}

.tenant-info p {
    margin: 0.25rem 0;
}

.document-token-section {
    background-color: #f0f9ff;
    padding: 0.75rem;
    border-radius: 4px;
    margin: 1rem 0;
    border-left: 3px solid #3b82f6;
}

.document-form {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
}

input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
}
</style>
