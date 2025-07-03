<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/state";
import {
    onDestroy,
    onMount,
} from "svelte";
import { v4 as uuid } from "uuid";
import { userManager } from "../../../auth/UserManager";
import AuthComponent from "../../../components/AuthComponent.svelte";
import BacklinkPanel from "../../../components/BacklinkPanel.svelte";
import OutlinerBase from "../../../components/OutlinerBase.svelte";
import SearchPanel from "../../../components/SearchPanel.svelte";
import { TreeViewManager } from "../../../fluid/TreeViewManager";
import {
    cleanupLinkPreviews,
    setupLinkPreviewHandlers,
} from "../../../lib/linkPreviewHandler";
import { getLogger } from "../../../lib/logger";
import {
    Item,
    Items,
} from "../../../schema/app-schema";
import { getFluidClientByProjectTitle } from "../../../services";
import { fluidStore } from "../../../stores/fluidStore.svelte";
import { store } from "../../../stores/store.svelte";

const logger = getLogger("ProjectPage");

// URLパラメータを取得
let projectName = page.params.project;
let pageName = page.params.page;

// デバッグ用ログ
logger.info(`Page component initialized with params: project="${projectName}", page="${pageName}"`);

// ページの状態
let error: string | undefined = $state(undefined);
let isLoading = $state(true);
let isAuthenticated = $state(false);
let pageNotFound = $state(false);
let isTemporaryPage = $state(false); // 仮ページかどうかのフラグ
let hasBeenEdited = $state(false); // 仮ページが編集されたかどうかのフラグ
let isSearchPanelVisible = $state(false); // 検索パネルの表示状態

// URLパラメータと認証状態を監視して更新
$effect(() => {
    logger.info(`Effect triggered: project=${projectName}, page=${pageName}, isAuthenticated=${isAuthenticated}`);
    logger.info(`Effect: projectName="${projectName}", pageName="${pageName}"`);
    logger.info(`Effect: URL params - project exists: ${!!projectName}, page exists: ${!!pageName}`);
    logger.info(`Effect: Authentication status: ${isAuthenticated}`);

    // プロジェクトとページが指定されており、認証済みの場合、データを読み込む
    if (projectName && pageName && isAuthenticated) {
        logger.info(`Effect: All conditions met - calling loadProjectAndPage()`);
        loadProjectAndPage();
    }
    else {
        logger.info(
            `Effect: Skipping loadProjectAndPage: projectName="${projectName}" (${!!projectName}), pageName="${pageName}" (${!!pageName}), isAuthenticated=${isAuthenticated}`,
        );
    }
});

// 認証成功時の処理
async function handleAuthSuccess(authResult: any) {
    logger.info("handleAuthSuccess: 認証成功:", authResult);
    logger.info(`handleAuthSuccess: Setting isAuthenticated from ${isAuthenticated} to true`);
    isAuthenticated = true;

    // isAuthenticatedの変更により$effectが自動的にloadProjectAndPageを呼び出すため、
    // ここでは明示的に呼び出さない（重複を避ける）
    logger.info(`handleAuthSuccess: isAuthenticated set to true, $effect will handle loadProjectAndPage`);
    logger.info(`handleAuthSuccess: Current params - project="${projectName}", page="${pageName}"`);
}

// 認証ログアウト時の処理
function handleAuthLogout() {
    logger.info("ログアウトしました");
    isAuthenticated = false;
}

// プロジェクトとページを読み込む
async function loadProjectAndPage() {
    logger.info(`loadProjectAndPage: Starting for project="${projectName}", page="${pageName}"`);
    isLoading = true;
    error = undefined;
    pageNotFound = false;

    logger.info(`loadProjectAndPage: Set isLoading=true, calling getFluidClientByProjectTitle`);

    try {
        // コンテナを読み込む
        logger.info(`loadProjectAndPage: Calling getFluidClientByProjectTitle("${projectName}")`);
        const client = await getFluidClientByProjectTitle(projectName);
        logger.info(`loadProjectAndPage: FluidClient loaded for project: ${projectName}`);
        logger.info(`loadProjectAndPage: Client containerId: ${client?.containerId}`);

        // fluidClientストアを更新
        logger.info(`loadProjectAndPage: Setting fluidStore.fluidClient`);
        logger.info(`loadProjectAndPage: Client before setting:`, {
            containerId: client?.containerId,
            clientId: client?.clientId,
        });
        fluidStore.fluidClient = client;
        logger.info(`loadProjectAndPage: FluidStore updated with client`);
        logger.info(`loadProjectAndPage: FluidStore.fluidClient exists: ${!!fluidStore.fluidClient}`);
        logger.info(`loadProjectAndPage: FluidStore.fluidClient containerId: ${fluidStore.fluidClient?.containerId}`);

        // グローバルストアの状態をログ出力
        if (typeof window !== "undefined") {
            const globalStore = (window as any).generalStore;
            logger.info(`Global generalStore exists: ${!!globalStore}`);
            if (globalStore) {
                logger.info(`generalStore.project exists: ${!!globalStore.project}`);
                logger.info(`generalStore.pages exists: ${!!globalStore.pages}`);
                logger.info(`generalStore.currentPage exists: ${!!globalStore.currentPage}`);
                logger.info(`generalStore === store: ${globalStore === store}`);
            }
        }

        // プロジェクトの設定を待つ
        let retryCount = 0;
        const maxRetries = 20; // リトライ回数を増やす
        while (!store.project && retryCount < maxRetries) {
            logger.info(`Waiting for store.project to be set... retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 200)); // 待機時間を増やす
            retryCount++;
        }

        logger.info(`Store.project exists: ${!!store.project}`);
        logger.info(`Store.pages exists: ${!!store.pages}`);

        // store.pagesの設定も待つ
        retryCount = 0;
        while (!store.pages && retryCount < maxRetries) {
            logger.info(`Waiting for store.pages to be set... retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 200));
            retryCount++;
        }

        if (store.project) {
            logger.info(`Project title: "${store.project.title}"`);
            const items = store.project.items as any;
            logger.info(`Project items count: ${items?.length || 0}`);
        }

        // ページを検索
        if (store.pages) {
            logger.info(`Available pages count: ${store.pages.current.length}`);
            for (let i = 0; i < store.pages.current.length; i++) {
                const page = store.pages.current[i];
                logger.info(`Page ${i}: "${page.text}"`);
            }

            const foundPage = findPageByName(pageName);
            if (foundPage) {
                store.currentPage = foundPage;
                isTemporaryPage = false;
                hasBeenEdited = false;
                logger.info(`Found existing page: ${pageName}`);
                logger.info(
                    `store.currentPage set to existing page: ${store.currentPage?.text}, id: ${store.currentPage?.id}`,
                );
            }
            else {
                // プロジェクトは存在するが、ページが存在しない場合は仮ページを表示
                isTemporaryPage = true;
                hasBeenEdited = false;

                // 仮ページ用の一時的なアイテムを作成（SharedTreeには追加しない）
                const tempItem = createTemporaryItem(pageName);
                store.currentPage = tempItem;

                logger.info(`Creating temporary page: ${pageName}`);
                logger.info(
                    `store.currentPage set to temporary page: ${store.currentPage?.text}, id: ${store.currentPage?.id}`,
                );
            }
        }
        else {
            pageNotFound = true;
            logger.error("No pages available - store.pages is null/undefined");
            logger.error(`store.project exists: ${!!store.project}`);
            if (store.project) {
                logger.error(`store.project.items exists: ${!!store.project.items}`);
                const items = store.project.items as any;
                logger.error(`store.project.items length: ${items?.length || 0}`);
            }
        }
    }
    catch (err) {
        console.error("Failed to load project and page:", err);
        error = err instanceof Error
            ? err.message
            : "プロジェクトとページの読み込み中にエラーが発生しました。";
    }
    finally {
        isLoading = false;
    }
}

// ページ名からページを検索する
function findPageByName(name: string) {
    if (!store.pages) return undefined;

    logger.info(`Searching for page: "${name}"`);

    // ページ名が一致するページを検索
    for (const page of store.pages.current) {
        logger.info(`Checking page: "${page.text}" against "${name}"`);
        if (page.text.toLowerCase() === name.toLowerCase()) {
            logger.info(`Found matching page: "${page.text}"`);
            return page;
        }
    }

    logger.info(`No matching page found for: "${name}"`);
    return undefined;
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

    logger.info(`Creating temporary item for page: ${pageName}, user: ${currentUser}`);

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

    logger.info(`Created temporary item with ID: ${tempItem.id}`);
    return tempItem;
}

/**
 * 仮ページを実際のページとして保存する
 */
function saveTemporaryPage() {
    if (!isTemporaryPage || !hasBeenEdited || !store.project) {
        logger.info(
            `saveTemporaryPage skipped: isTemporaryPage=${isTemporaryPage}, hasBeenEdited=${hasBeenEdited}, project=${!!store
                .project}`,
        );
        return;
    }

    try {
        const currentUser = fluidStore.currentUser?.id || "anonymous";
        logger.info(`Saving temporary page: ${pageName} by user: ${currentUser}`);

        // 新しいページを作成
        const newPage = TreeViewManager.addPage(
            store.project,
            pageName,
            currentUser,
        );
        logger.info(`Created new page with ID: ${newPage.id}`);

        // 仮ページの内容を新しいページにコピー
        if (store.currentPage) {
            // 一時的なページの現在のテキストを保持
            const currentText = store.currentPage.text || pageName;
            newPage.updateText(currentText);
            logger.info(`Updated page text to: ${currentText}`);

            // 子アイテムがあれば、それも追加
            // TypeScriptエラーを回避するためにキャストを使用
            const tempItems = store.currentPage.items as unknown as Items;
            if (tempItems && tempItems.length > 0) {
                logger.info(`Copying ${tempItems.length} child items`);
                for (let i = 0; i < tempItems.length; i++) {
                    const item = tempItems[i] as Item;
                    const newItems = newPage.items as unknown as Items;
                    const newItem = newItems.addNode(currentUser);
                    newItem.updateText(item.text);
                    logger.info(`Copied item ${i}: ${item.text}`);
                }
            }
        }

        // 現在のページを新しいページに更新
        store.currentPage = newPage;
        logger.info(`Updated store.currentPage to new page`);

        // 仮ページフラグをリセット
        isTemporaryPage = false;
        hasBeenEdited = false;

        logger.info(`Temporary page saved as actual page: ${pageName}`);
    }
    catch (error) {
        logger.error("Failed to save temporary page:", error);
    }
}

/**
 * 仮ページが編集されたことを検知する
 */
function handleTemporaryPageEdited() {
    logger.info(`handleTemporaryPageEdited called: isTemporaryPage=${isTemporaryPage}, hasBeenEdited=${hasBeenEdited}`);

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

// プロジェクトページに戻る
function goToProject() {
    goto(`/${projectName}`);
}

function goToSchedule() {
    goto(`/${projectName}/${pageName}/schedule`);
}

function goToGraphView() {
    goto(`/${projectName}/graph`);
}

// 検索パネルの表示を切り替える
function toggleSearchPanel() {
    isSearchPanelVisible = !isSearchPanelVisible;
}

onMount(async () => {
    // UserManagerの認証状態を確認（非同期対応）
    logger.info(`onMount: Starting for project="${projectName}", page="${pageName}"`);
    logger.info(`onMount: URL params - projectName: "${projectName}", pageName: "${pageName}"`);

    // 初期認証状態を確認
    let currentUser = userManager.getCurrentUser();
    logger.info(`onMount: Initial auth check - currentUser exists: ${!!currentUser}`);
    logger.info(`onMount: UserManager instance exists: ${!!userManager}`);

    if (currentUser) {
        isAuthenticated = true;
        logger.info("onMount: User already authenticated, setting isAuthenticated=true");
    }
    else {
        // 認証状態が変更されるまで待機（テスト環境対応）
        logger.info("onMount: No current user, waiting for authentication...");
        let retryCount = 0;
        const maxRetries = 50; // 5秒間待機

        while (!currentUser && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100));
            currentUser = userManager.getCurrentUser();
            retryCount++;

            if (retryCount % 10 === 0) {
                logger.info(`onMount: Auth check retry ${retryCount}/${maxRetries}`);
            }
        }

        if (currentUser) {
            isAuthenticated = true;
            logger.info(`onMount: Authentication detected after ${retryCount} retries, setting isAuthenticated=true`);
        }
        else {
            logger.info("onMount: No authentication detected after retries, staying unauthenticated");
        }
    }

    logger.info(`onMount: Final authentication status: ${isAuthenticated}`);
    logger.info(`onMount: About to complete, $effect should trigger with isAuthenticated=${isAuthenticated}`);

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
    <title>
        {pageName ? pageName : "ページ"} - {
            projectName
            ? projectName
            : "プロジェクト"
        } | Fluid Outliner
    </title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
    <div class="mb-4">
        <!-- パンくずナビゲーション -->
        <nav class="mb-2 flex items-center text-sm text-gray-600">
            <button
                onclick={goHome}
                class="text-blue-600 hover:text-blue-800 hover:underline"
            >
                ホーム
            </button>
            {#if projectName}
                <span class="mx-2">/</span>
                <button
                    onclick={goToProject}
                    class="text-blue-600 hover:text-blue-800 hover:underline"
                >
                    {projectName}
                </button>
            {/if}
            {#if pageName}
                <span class="mx-2">/</span>
                <span class="text-gray-900">{pageName}</span>
            {/if}
        </nav>

        <!-- ページタイトルと検索ボタン -->
        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">
                {#if projectName && pageName}
                    <span class="text-gray-600">{projectName} /</span> {pageName}
                {:else}
                    ページ
                {/if}
            </h1>
            <div class="space-x-2">
                <button
                    onclick={toggleSearchPanel}
                    class="search-btn px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    検索
                </button>
                <button
                    onclick={goToSchedule}
                    class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                    予約管理
                </button>
                <button
                    onclick={goToGraphView}
                    data-testid="graph-view-button"
                    class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                    グラフビュー
                </button>
            </div>
        </div>
    </div>

    <!-- 認証コンポーネント -->
    <div class="auth-section mb-6">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if store.currentPage}
        <!-- デバッグ用ログ -->
        {
            logger.info(
                `Rendering OutlinerBase: pageItem.id=${store.currentPage.id}, isTemporary=${isTemporaryPage}, onEdit=${!!handleTemporaryPageEdited}`,
            )
        }

        <!-- OutlinerBase コンポーネントでアウトライナーを表示 -->
        <OutlinerBase
            pageItem={store.currentPage}
            projectName={projectName}
            pageName={pageName}
            isReadOnly={false}
            isTemporary={isTemporaryPage}
            onEdit={handleTemporaryPageEdited}
        />

        <!-- バックリンクパネル -->
        {#if !isTemporaryPage}
            <BacklinkPanel {pageName} {projectName} />
        {/if}

        <!-- 検索パネル -->
        <SearchPanel
            isVisible={isSearchPanelVisible}
            pageItem={store.currentPage}
            project={store.project}
        />
    {:else}
        <!-- デバッグ用ログ --> {logger.info(`OutlinerBase not rendered: store.currentPage=${!!store.currentPage}`)}
    {/if}
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
                    <h3 class="text-sm font-medium text-red-800">
                        エラーが発生しました
                    </h3>
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
                    <h3 class="text-sm font-medium text-yellow-800">
                        ページが見つかりません
                    </h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>
                            指定されたページ「{pageName}」はプロジェクト「{projectName}」内に存在しません。
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
                        <p>このページを表示するには、ログインしてください。</p>
                    </div>
                </div>
            </div>
        </div>
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
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>
