<script lang="ts">
import {
    onDestroy,
    onMount,
} from "svelte";
import {
    type IUser,
    userManager,
} from "../auth/UserManager";

interface Props {
    // Define callback props instead of using createEventDispatcher
    onAuthSuccess?: ((authResult: any) => void) | undefined;
    onAuthLogout?: (() => void) | undefined;
}

let { onAuthSuccess = undefined, onAuthLogout = undefined }: Props = $props();

let isLoading = $state(true);
let error = $state("");
let currentUser: IUser | null = $state(null);
let loginError = $state("");

// 開発環境用のメール/パスワード認証フォーム
let showDevLogin = $state(false);
let email = $state("test@example.com");
let password = $state("password");

// 環境チェック
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === "development";

// リスナー解除用の関数
let unsubscribe: (() => void) | null = null;

onMount(() => {
    // 認証状態の変更を監視
    unsubscribe = userManager.addEventListener(authResult => {
        isLoading = false;

        if (authResult) {
            currentUser = authResult.user;
            // Call the callback prop directly instead of dispatching
            if (onAuthSuccess) onAuthSuccess(authResult);
        }
        else {
            currentUser = null;
            // Call the callback prop directly instead of dispatching
            if (onAuthLogout) onAuthLogout();
        }
    });

    // 初期状態を設定
    currentUser = userManager.getCurrentUser();
    if (currentUser) {
        isLoading = false;
    }
    else {
        // 短時間後にローディング状態解除（認証状態が不明の場合）
        setTimeout(() => {
            isLoading = false;
        }, 1000);
    }

    // テスト用: カスタム認証イベントリスナー
    if (typeof document !== "undefined") {
        document.addEventListener("auth-success", (event: any) => {
            if (event.detail && event.detail.user) {
                currentUser = event.detail.user;
                // Call the callback prop directly
                if (onAuthSuccess) onAuthSuccess(event.detail);
            }
        });
    }
});

onDestroy(() => {
    if (unsubscribe) {
        unsubscribe();
    }
});

async function handleLogin() {
    try {
        isLoading = true;
        error = "";
        loginError = "";
        await userManager.loginWithGoogle();
    }
    catch (err: unknown) {
        console.error("Login error:", err);
        loginError = (err as Error).message || "ログイン中にエラーが発生しました";
        isLoading = false;
    }
}

async function handleDevLogin() {
    try {
        isLoading = true;
        error = "";
        loginError = "";
        await userManager.loginWithEmailPassword(email, password);
    }
    catch (err: unknown) {
        console.error("Development login error:", err);
        loginError = (err as Error).message ||
            "開発用ログインでエラーが発生しました";
        isLoading = false;
    }
}

async function handleLogout() {
    try {
        isLoading = true;
        error = "";
        await userManager.logout();
    }
    catch (err) {
        console.error("Logout error:", err);
        error = (err as Error).message || "ログアウト中にエラーが発生しました";
        isLoading = false;
    }
}

function toggleDevLogin() {
    showDevLogin = !showDevLogin;
}
</script>

<div class="auth-container">
    {#if isLoading}
        <div class="loading">
            <p>認証情報を確認中...</p>
        </div>
    {:else if error}
        <div class="error">
            <p>{error}</p>
            <button onclick={() => (error = "")} class="try-again">再試行</button>
        </div>
    {:else if currentUser}
        <div class="user-info">
            {#if currentUser.photoURL}
                <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    class="avatar"
                />
            {/if}
            <div class="user-details">
                <p class="user-name">{currentUser.name}</p>
                <p class="user-email">{currentUser.email || ""}</p>
            </div>
            <button onclick={handleLogout} class="logout-btn">ログアウト</button>
        </div>
    {:else}
        <!-- Google認証ボタン -->
        <button
            onclick={handleLogin}
            class="auth-button google-btn"
            disabled={isLoading}
        >
            <span class="google-icon">
                <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                    />
                    <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                    />
                    <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                    />
                    <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                    />
                </svg>
            </span>
            Googleでログイン
        </button>

        {#if isDevelopment}
            <!-- 開発環境用ログイントグルボタン -->
            <button onclick={toggleDevLogin} class="dev-toggle">
                {showDevLogin ? "開発者ログインを隠す" : "開発者ログイン"}
            </button>

            {#if showDevLogin}
                <div class="dev-login-form">
                    <h3>開発環境用ログイン</h3>
                    <div class="form-group">
                        <label for="email">メールアドレス</label>
                        <input
                            type="email"
                            id="email"
                            bind:value={email}
                            placeholder="test@example.com"
                        />
                    </div>
                    <div class="form-group">
                        <label for="password">パスワード</label>
                        <input
                            type="password"
                            id="password"
                            bind:value={password}
                            placeholder="password"
                        />
                    </div>
                    <button onclick={handleDevLogin} class="dev-login-btn">開発環境でログイン</button>
                </div>
            {/if}
        {/if}

        {#if loginError}
            <p class="error-message">{loginError}</p>
        {/if}
    {/if}
</div>

<style>
.auth-container {
    margin: 1rem 0;
}

.google-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: white;
    color: #737373;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.3s;
    width: 100%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.google-btn:hover {
    background-color: #f8f8f8;
}

.google-icon {
    margin-right: 0.5rem;
}

.loading {
    text-align: center;
    padding: 0.75rem;
    background-color: #f0f8ff;
    border-radius: 4px;
}

.error {
    color: #d32f2f;
    padding: 0.75rem;
    background-color: #ffebee;
    border-radius: 4px;
    margin-bottom: 1rem;
}

.error-message {
    color: #d32f2f;
    font-size: 0.9rem;
    margin-top: 0.5rem;
}

.try-again {
    background-color: transparent;
    border: none;
    color: #1976d2;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
}

.user-info {
    display: flex;
    align-items: center;
    padding: 0.75rem;
    background-color: #f5f5f5;
    border-radius: 4px;
}

.avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-right: 0.75rem;
}

.user-details {
    flex: 1;
}

.user-name {
    font-weight: 500;
    margin: 0;
}

.user-email {
    font-size: 0.85rem;
    color: #666;
    margin: 0;
}

.logout-btn {
    background-color: transparent;
    color: #d32f2f;
    border: 1px solid #d32f2f;
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.3s;
}

.logout-btn:hover {
    background-color: #ffebee;
}

/* 開発環境用ログインスタイル */
.dev-toggle {
    background-color: #f0f0f0;
    color: #666;
    border: none;
    border-radius: 4px;
    padding: 0.5rem;
    font-size: 0.8rem;
    margin-top: 0.5rem;
    cursor: pointer;
    width: 100%;
}

.dev-login-form {
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 1rem;
    margin-top: 0.5rem;
}

.dev-login-form h3 {
    margin-top: 0;
    font-size: 1rem;
    color: #444;
}

.form-group {
    margin-bottom: 0.75rem;
}

.form-group label {
    display: block;
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
    color: #555;
}

.form-group input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
}

.dev-login-btn {
    background-color: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    cursor: pointer;
    width: 100%;
}

.dev-login-btn:hover {
    background-color: #1976d2;
}
</style>
