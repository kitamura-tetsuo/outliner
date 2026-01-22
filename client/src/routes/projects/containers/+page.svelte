<script lang="ts">
import { goto } from "$app/navigation";
import {
    onDestroy,
    onMount,
} from "svelte";
import {
    userManager,
} from "../../../auth/UserManager";
import AuthComponent from "../../../components/AuthComponent.svelte";
import * as yjsHighService from "../../../lib/yjsService.svelte";
import { getLogger } from "../../../lib/logger";
import { saveContainerId } from "../../../stores/firestoreStore.svelte";
import { yjsStore } from "../../../stores/yjsStore.svelte";
import { v4 as uuidv4 } from "uuid";
const logger = getLogger();

let isLoading = $state(false);
let error: string | undefined = $state(undefined);
let success: string | undefined = $state(undefined);
let containerName = $state("");
let isAuthenticated = $state(false);
let createdContainerId: string | undefined = $state(undefined);

// 認証成功時の処理
async function handleAuthSuccess(authResult) {
    logger.info("認証成功:", authResult);
    isAuthenticated = true;
}

// 認証ログアウト時の処理
function handleAuthLogout() {
    logger.info("ログアウトしました");
    isAuthenticated = false;
}

// 新規コンテナを作成する
async function createNewContainer() {
    if (!containerName.trim()) {
        error = "アウトライナー名を入力してください";
        return;
    }

    isLoading = true;
    error = undefined;
    success = undefined;

    try {
        // 現在のクライアントを破棄してリセット
        const client = yjsStore.yjsClient as any;
        if (client) {
            client.dispose?.();
            yjsStore.yjsClient = undefined;
        }

        // 1. IDを先に生成
        const newProjectId = uuidv4();
        createdContainerId = newProjectId; // UIに即座に反映

        // 2. サーバーに保存してアクセス権を確定させる（WebSocket接続前に行うのが重要）
        logger.info(`Saving new container ID ${newProjectId} to server...`);
        const saveResult = await saveContainerId(newProjectId);
        if (!saveResult) {
            throw new Error("サーバーへのコンテナID保存に失敗しました");
        }

        // 3. 権限が確定してからWebSocket接続を開始
        logger.info(`Connecting to WebSocket for ${newProjectId}...`);
        const newClient = await yjsHighService.createNewProject(containerName, newProjectId);

        // ストアを更新
        yjsStore.yjsClient = newClient as any;

        success = `新しいアウトライナーが作成されました！ (ID: ${createdContainerId})`;

        // 1.5秒後に作成したプロジェクトのページに移動
        setTimeout(() => {
            goto("/" + containerName);
        }, 1500);
    }
    catch (err) {
        logger.error("新規アウトライナー作成エラー:", err);
        error = err instanceof Error
            ? err.message
            : "新規アウトライナーの作成中にエラーが発生しました。";
    }
    finally {
        isLoading = false;
    }
}

onMount(() => {
    // UserManagerの認証状態を確認

    isAuthenticated = userManager.getCurrentUser() !== null;
});

onDestroy(() => {
    // 必要に応じてクリーンアップコード
});
</script>

<svelte:head>
    <title>新規アウトライナー作成 - Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
    <h1 class="mb-6 text-center text-3xl font-bold">
        新規アウトライナーの作成
    </h1>

    <div class="auth-section mb-8">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if isAuthenticated}
        <div class="mx-auto max-w-md rounded-lg bg-white p-6 shadow-md">
            <h2 class="mb-4 text-xl font-semibold">
                新しいアウトライナーを作成
            </h2>

            <div class="mb-4">
                <label
                    for="containerName"
                    class="mb-1 block text-sm font-medium text-gray-700"
                >
                    アウトライナー名
                </label>
                <input
                    type="text"
                    id="containerName"
                    bind:value={containerName}
                    placeholder="マイアウトライナー"
                    class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {#if error}
                <div
                    class="mb-4 rounded-md bg-red-100 p-3 text-red-700"
                    role="alert"
                >
                    {error}
                </div>
            {/if}

            {#if success}
                <div
                    class="mb-4 rounded-md bg-green-100 p-3 text-green-700"
                    role="alert"
                >
                    {success}
                </div>
            {/if}

            <button
                onclick={createNewContainer}
                disabled={isLoading}
                class="
                    w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {isLoading
                    ? 'cursor-not-allowed opacity-70'
                    : ''}
                "
            >
                {#if isLoading}
                    <span class="mr-2 inline-block animate-spin">⏳</span> 作成中...
                {:else}
                    作成する
                {/if}
            </button>

            {#if createdContainerId}
                <div class="mt-4 rounded-md bg-gray-100 p-3">
                    <p class="text-sm text-gray-700">
                        作成されたコンテナID: <code class="rounded bg-gray-200 px-1 py-0.5">{createdContainerId}</code>
                    </p>
                </div>
            {/if}
        </div>
    {:else}
        <div class="mx-auto max-w-md rounded-lg bg-yellow-50 p-6 shadow-md">
            <h2 class="mb-2 text-xl font-semibold">認証が必要です</h2>
            <p class="mb-4 text-gray-700">
                新しいアウトライナーを作成するには、まず上部のログインボタンからログインしてください。
            </p>
        </div>
    {/if}

    <div class="mt-6 text-center">
        <a
            href="/"
            class="rounded-md px-2 py-1 text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
            ホームに戻る
        </a>
    </div>
</main>

<style>
/* スタイリングが必要な場合は追加 */
</style>
