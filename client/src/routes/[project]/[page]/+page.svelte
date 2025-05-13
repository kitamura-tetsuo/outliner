<script lang="ts">
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { goto } from "$app/navigation";
import { onDestroy, onMount } from "svelte";
import { UserManager } from "../../../auth/UserManager";
import AuthComponent from "../../../components/AuthComponent.svelte";
import OutlinerBase from "../../../components/OutlinerBase.svelte";
import BacklinkPanel from "../../../components/BacklinkPanel.svelte";
import { getLogger } from "../../../lib/logger";
import { fluidStore } from "../../../stores/fluidStore.svelte";
import { loadContainer } from "../../../services";
import { store } from "../../../stores/store.svelte";
import { Item, Items } from "../../../schema/app-schema";
import { v4 as uuid } from "uuid";
import { TreeViewManager } from "../../../fluid/TreeViewManager";
import { setupLinkPreviewHandlers, cleanupLinkPreviews } from "../../../lib/linkPreviewHandler";

const logger = getLogger("ProjectPage");

// URLパラメータを取得
let projectName = $state("");
let pageName = $state("");

// ページの状態
let error: string | null = $state(null);
let isLoading = $state(true);
let isAuthenticated = $state(false);
let pageNotFound = $state(false);
let isTemporaryPage = $state(false); // 仮ページかどうかのフラグ
let hasBeenEdited = $state(false); // 仮ページが編集されたかどうかのフラグ

// URLパラメータを監視して更新
$effect(() => {
    if ($page.params.project) {
        projectName = $page.params.project;
    }
    if ($page.params.page) {
        pageName = $page.params.page;
    }

    logger.info(`Loading project: ${projectName}, page: ${pageName}`);

    // プロジェクトとページが指定されている場合、データを読み込む
    if (projectName && pageName && isAuthenticated) {
        loadProjectAndPage();
    }
});

// 認証成功時の処理
async function handleAuthSuccess(authResult: any) {
    logger.info("認証成功:", authResult);
    isAuthenticated = true;

    // 認証成功後にプロジェクトとページを読み込む
    if (projectName && pageName) {
        loadProjectAndPage();
    }
}

// 認証ログアウト時の処理
function handleAuthLogout() {
    logger.info("ログアウトしました");
    isAuthenticated = false;
}

// プロジェクトとページを読み込む
async function loadProjectAndPage() {
    isLoading = true;
    error = null;
    pageNotFound = false;

    try {
        // TODO: プロジェクト名からコンテナIDを取得する処理を実装
        // 現在はダミーのコンテナIDを使用
        const containerId = projectName;

        // コンテナを読み込む
        const client = await loadContainer(containerId);

        // fluidClientストアを更新
        fluidStore.fluidClient = client;

        // ページを検索
        if (store.pages) {
            const foundPage = findPageByName(pageName);
            if (foundPage) {
                store.currentPage = foundPage;
                isTemporaryPage = false;
                hasBeenEdited = false;
            } else {
                // プロジェクトは存在するが、ページが存在しない場合は仮ページを表示
                isTemporaryPage = true;
                hasBeenEdited = false;

                // 仮ページ用の一時的なアイテムを作成（SharedTreeには追加しない）
                const tempItem = createTemporaryItem(pageName);
                store.currentPage = tempItem;

                logger.info(`Creating temporary page: ${pageName}`);
            }
        } else {
            pageNotFound = true;
            logger.error("No pages available");
        }
    } catch (err) {
        console.error("Failed to load project and page:", err);
        error = err instanceof Error ? err.message : "プロジェクトとページの読み込み中にエラーが発生しました。";
    } finally {
        isLoading = false;
    }
}

// ページ名からページを検索する
function findPageByName(name: string) {
    if (!store.pages) return null;

    // ページ名が一致するページを検索
    for (const page of store.pages.current) {
        if (page.text.toLowerCase() === name.toLowerCase()) {
            return page;
        }
    }

    return null;
}

/**
 * 仮ページ用の一時的なアイテムを作成する
 * このアイテムはSharedTreeには追加されない
 * @param pageName ページ名
 * @returns 一時的なアイテム
 */
function createTemporaryItem(pageName: string): Item {
    const timeStamp = new Date().getTime();
    const currentUser = fluidStore.currentUser?.id || "anonymous";

    // 一時的なアイテムを作成
    const tempItem = new Item({
        id: `temp-${uuid()}`,
        text: pageName,
        author: currentUser,
        votes: [],
        created: timeStamp,
        lastChanged: timeStamp,
        // @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題
        items: new Items([]), // 子アイテムのための空のリスト
    });

    return tempItem;
}

/**
 * 仮ページを実際のページとして保存する
 */
function saveTemporaryPage() {
    if (!isTemporaryPage || !hasBeenEdited || !store.project) {
        return;
    }

    try {
        const currentUser = fluidStore.currentUser?.id || "anonymous";

        // 新しいページを作成
        const newPage = TreeViewManager.addPage(store.project, pageName, currentUser);

        // 仮ページの内容を新しいページにコピー
        if (store.currentPage) {
            newPage.updateText(pageName);

            // 子アイテムがあれば、それも追加
            // TypeScriptエラーを回避するためにキャストを使用
            const tempItems = store.currentPage.items as unknown as Items;
            if (tempItems && tempItems.length > 0) {
                for (let i = 0; i < tempItems.length; i++) {
                    const item = tempItems[i] as Item;
                    const newItems = newPage.items as unknown as Items;
                    const newItem = newItems.addNode(currentUser);
                    newItem.updateText(item.text);
                }
            }
        }

        // 現在のページを新しいページに更新
        store.currentPage = newPage;

        // 仮ページフラグをリセット
        isTemporaryPage = false;
        hasBeenEdited = false;

        logger.info(`Temporary page saved as actual page: ${pageName}`);
    } catch (error) {
        logger.error("Failed to save temporary page:", error);
    }
}

/**
 * 仮ページが編集されたことを検知する
 */
function handleTemporaryPageEdited() {
    if (isTemporaryPage && !hasBeenEdited) {
        hasBeenEdited = true;
        logger.info(`Temporary page edited: ${pageName}`);

        // 編集されたら実際のページとして保存
        saveTemporaryPage();
    }

    // ページ内容が更新されたため、リンクプレビューハンドラーを再設定
    // DOMの更新を待つ
    setTimeout(() => {
        setupLinkPreviewHandlers();
    }, 300);
}

// ホームに戻る
function goHome() {
    goto("/");
}

onMount(() => {
    // UserManagerの認証状態を確認
    const userManager = UserManager.getInstance();
    isAuthenticated = userManager.getCurrentUser() !== null;

    // ページ読み込み後にリンクプレビューハンドラーを設定
    // DOMが完全に読み込まれるのを待つ
    setTimeout(() => {
        setupLinkPreviewHandlers();
    }, 500);
});

onDestroy(() => {
    // リンクプレビューのクリーンアップ
    cleanupLinkPreviews();
});
</script>

<svelte:head>
    <title>{pageName ? pageName : 'ページ'} - {projectName ? projectName : 'プロジェクト'} | Fluid Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
    <div class="mb-4 flex items-center">
        <button onclick={goHome} class="mr-4 text-blue-600 hover:text-blue-800 hover:underline">
            ← ホームに戻る
        </button>
        <h1 class="text-2xl font-bold">
            {#if projectName && pageName}
                <span class="text-gray-600">{projectName} /</span> {pageName}
            {:else}
                ページ
            {/if}
        </h1>
    </div>

    <!-- 認証コンポーネント -->
    <div class="auth-section mb-6">
        <AuthComponent onAuthSuccess={handleAuthSuccess} onAuthLogout={handleAuthLogout} />
    </div>

    {#if isLoading}
        <div class="flex justify-center py-8">
            <div class="loader">読み込み中...</div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">エラーが発生しました</h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button
                            onclick={loadProjectAndPage}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            再試行
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if pageNotFound && !isTemporaryPage}
        <div class="rounded-md bg-yellow-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-yellow-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-yellow-800">ページが見つかりません</h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>指定されたページ「{pageName}」はプロジェクト「{projectName}」内に存在しません。</p>
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
                    <h3 class="text-sm font-medium text-blue-800">ログインが必要です</h3>
                    <div class="mt-2 text-sm text-blue-700">
                        <p>このページを表示するには、ログインしてください。</p>
                    </div>
                </div>
            </div>
        </div>
    {:else if store.currentPage}
        <!-- OutlinerBase コンポーネントでアウトライナーを表示 -->
        <OutlinerBase
            pageItem={store.currentPage}
            isReadOnly={false}
            isTemporary={isTemporaryPage}
            onEdit={handleTemporaryPageEdited}
        />

        <!-- バックリンクパネル -->
        {#if !isTemporaryPage}
            <BacklinkPanel pageName={pageName} projectName={projectName} />
        {/if}
    {:else}
        <div class="rounded-md bg-gray-50 p-4">
            <p class="text-gray-700">ページデータを読み込めませんでした。</p>
        </div>
    {/if}
</main>

<style>
.loader {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 0 auto;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>
