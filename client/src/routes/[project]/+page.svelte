<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import {
    onDestroy,
    onMount,
} from "svelte";
import { userManager } from "../../auth/UserManager";
import AuthComponent from "../../components/AuthComponent.svelte";
import PageList from "../../components/PageList.svelte";
import { getLogger } from "../../lib/logger";
import { store } from "../../stores/store.svelte";

const logger = getLogger("ProjectIndex");

// URLパラメータを取得（リアクティブに）
let projectName = $derived($page.params.project || "");

// ページの状態
let error: string | undefined = $state(undefined);
let isAuthenticated = $state(false);
let projectNotFound = $state(false);

// 認証成功時の処理
async function handleAuthSuccess(authResult: any) {
    if (import.meta.env.DEV) {
        logger.info("認証成功:", authResult);
    }
    isAuthenticated = true;
}

// 認証ログアウト時の処理
function handleAuthLogout() {
    if (import.meta.env.DEV) {
        logger.info("ログアウトしました");
    }
    isAuthenticated = false;
}

// ページを選択したときの処理
function handlePageSelected(event: CustomEvent) {
    const pageName = event.detail.pageName;

    if (pageName) {
        goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`);
    }
}

// ホームに戻る
function goHome() {
    goto("/");
}

onMount(() => {
    // UserManagerの認証状態を確認

    isAuthenticated = userManager.getCurrentUser() !== null;
});

onDestroy(() => {
    // クリーンアップコード
});
</script>

<svelte:head>
    <title>{projectName ? projectName : "プロジェクト"} | Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-4">
    <div class="mb-4 flex items-center">
        <button
            onclick={goHome}
            class="mr-4 text-blue-600 hover:text-blue-800 hover:underline"
        >
            ← ホームに戻る
        </button>
        <h1 class="text-2xl font-bold">
            {#if projectName}
                {projectName}
            {:else}
                プロジェクト
            {/if}
        </h1>
    </div>

    <!-- 認証コンポーネント -->
    <div class="auth-section mb-6">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if store.pages}
        <div class="mt-6">
            <h2 class="mb-4 text-xl font-semibold">ページ一覧</h2>
            <div class="rounded-lg bg-white p-4 shadow-md">
                <PageList
                    currentUser={userManager.getCurrentUser()?.id || "anonymous"}
                    project={store.project!}
                    rootItems={store.pages.current}
                    onPageSelected={handlePageSelected}
                />
            </div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">
                        エラーが発生しました
                    </h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button
                            onclick={() => window.location.reload()}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            再試行
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if projectNotFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-yellow-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-yellow-800">
                        プロジェクトが見つかりません
                    </h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>
                            指定されたプロジェクト「{projectName}」は存在しません。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if !isAuthenticated}
        <div class="rounded-md bg-blue-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-blue-400">ℹ️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-blue-800">
                        ログインが必要です
                    </h3>
                    <div class="mt-2 text-sm text-blue-700">
                        <p>
                            このプロジェクトを表示するには、ログインしてください。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <div class="rounded-md bg-gray-50 p-4">
            <p class="text-gray-700">
                プロジェクトデータを読み込めませんでした。
            </p>
        </div>
    {/if}
</main>

<style>
/* .loader {  未使用のため削除 */
/* .loader {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 0 auto;
} */

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>
