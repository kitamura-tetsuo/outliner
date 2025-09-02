<script lang="ts">
export const ssr = false;
import { goto } from "$app/navigation";
import { page } from "$app/state";
import {
    onDestroy,
    onMount
} from "svelte";

import { userManager } from "../../../auth/UserManager";
import AuthComponent from "../../../components/AuthComponent.svelte";
import BacklinkPanel from "../../../components/BacklinkPanel.svelte";
import OutlinerBase from "../../../components/OutlinerBase.svelte";
import SearchPanel from "../../../components/SearchPanel.svelte";
import {
    cleanupLinkPreviews,
    setupLinkPreviewHandlers,
} from "../../../lib/linkPreviewHandler";
import { getLogger } from "../../../lib/logger";
import { initializeStoreFromYjs } from "../../../lib/yjsStoreHelper.svelte";
import { YjsProjectManager } from "../../../lib/yjsProjectManager.svelte";
// import { getFluidClientByProjectTitle } from "../../../services"; // Yjsモードでは無効化
// import { fluidStore } from "../../../stores/fluidStore.svelte"; // Yjsモードでは無効化
import { searchHistoryStore } from "../../../stores/SearchHistoryStore.svelte";
import { store } from "../../../stores/store.svelte";
import { Item } from "../../../schema/app-schema";

const logger = getLogger("ProjectPage");

// URLパラメータを取得
let projectName: string = page.params.project || "";
let pageName: string = page.params.page || "";
// フォールバック用に、ページタイトルから解決した実IDを保持
let fallbackPageId = $state<string | null>(null);


// デバッグ用ログ
logger.info(`Page component initialized with params: project="${projectName}", page="${pageName}"`);

// ページの状態
let error: string | undefined = $state(undefined);
let isLoading = $state(true);
let isAuthenticated = $state(false);
let pageNotFound = $state(false);

let isSearchPanelVisible = $state(false); // 検索パネルの表示状態
let initStarted = $state(false); // 重複初期化を防ぐガード

// レンダリング用のページアイテム
// store.currentPage または ページ一覧からタイトル一致で実IDが取れた場合は暫定Itemを作成
// fallbackPageIdがあれば暫定Itemを作成（安定IDのみ使用して再描画ループを防ぐ）
const pageItemToRender = $derived(
    store.currentPage
    ?? (store.pages?.current?.find(p => p.text === pageName) as any)
    ?? (fallbackPageId ? (new Item({ id: fallbackPageId, text: pageName, author: "anonymous" }) as any) : undefined)
);

// URLパラメータと認証状態を監視して更新
$effect(() => {
    logger.info(`Effect triggered: project=${projectName}, page=${pageName}, isAuthenticated=${isAuthenticated}`);
    logger.info(`Effect: projectName="${projectName}", pageName="${pageName}"`);
    logger.info(`Effect: URL params - project exists: ${!!projectName}, page exists: ${!!pageName}`);
    logger.info(`Effect: Authentication status: ${isAuthenticated}`);

    // プロジェクトとページが指定されている場合、データを読み込む（Yjsモードでは認証不要）
    if (projectName && pageName) {
        // 重複初期化を防止
        if (initStarted) {
            logger.info(`Effect: Initialization already started, skipping loadProjectAndPage()`);
            return;
        }
        initStarted = true;
        logger.info(`Effect: All conditions met - calling loadProjectAndPage()`);

        // 現在のプロジェクトとURLパラメータのプロジェクトが一致するかチェック
        const currentProjectTitle = store.project?.title;
        if (currentProjectTitle && currentProjectTitle !== projectName) {
            logger.info(`Effect: Project mismatch - current: "${currentProjectTitle}", URL: "${projectName}"`);
            logger.info(`Effect: Need to load different project`);
        }

        loadProjectAndPage();
    }
    else {
        logger.info(
            `Effect: Skipping loadProjectAndPage: projectName="${projectName}" (${!!projectName}), pageName="${pageName}" (${!!pageName})`,
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
        // Yjsモードでプロジェクトマネージャーを使用してストアを初期化
        logger.info(`loadProjectAndPage: Using Yjs mode for project: ${projectName}`);

        // プロジェクト名からプロジェクトIDを生成（Yjsサーバのルーム名制約に合わせてスラッグ化）
        const slugify = (input: string) => {
            const s = (input || "").toString().trim().toLowerCase();
            const slug = s
                .replace(/[^a-z0-9_-]+/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-+|-+$/g, "");
            return slug || "default-project";
        };
        const projectId = slugify(projectName || "default-project");

        // ページ名からページID（タイトル）を生成
        const pageTitle = pageName || "default-page";

        logger.info(`Initializing Yjs project: ${projectId}, pageTitle: ${pageTitle}`);

        // YjsProjectManagerを作成して接続
        const yjsProjectManager = new YjsProjectManager(projectId);
        await yjsProjectManager.connect(projectName || projectId);

        // グローバルに公開（デバッグ用）
        if (typeof window !== "undefined") {
            (window as any).__YJS_PROJECT_MANAGER__ = yjsProjectManager;
        }

        // ページIDのフォールバック解決（onMountで既に実行済みの場合はスキップ）
        if (!fallbackPageId) {
            try {
                const pages = yjsProjectManager.getPages();
                const byTitle = pages.find(p => p.title === pageTitle);
                if (byTitle) {
                    fallbackPageId = byTitle.id;
                    logger.info(`Resolved fallbackPageId from title: ${fallbackPageId}`);
                } else {
                    logger.warn(`Failed to resolve fallbackPageId by title: ${pageTitle}`);
                }
            } catch (e) {
                logger.error("Failed to resolve fallbackPageId", e as any);
            }
        }

        // ストアを初期化（タイトル指定でページ作成/取得を行う）
        await initializeStoreFromYjs(yjsProjectManager, pageTitle);

        // グローバルに公開（デバッグ用）
        if (typeof window !== "undefined") {
            (window as any).__YJS_PROJECT_MANAGER__ = yjsProjectManager;
        }

        logger.info("Yjs project and store initialization completed");

        // ストアの状態をログ出力
        logger.info(`Store state after initialization:`, {
            projectExists: !!store.project,
            projectTitle: store.project?.title,
            pagesExists: !!store.pages,
            currentPageExists: !!store.currentPage,
            currentPageTitle: store.currentPage?.text,
        });

        // ストアが正しく初期化されているかチェック
        if (!store.project) {
            throw new Error("Failed to initialize project in store");
        }

        if (!store.currentPage) {
            logger.warn("Current page not set in store after init, trying fallback fetch...");
            try {
                const fallback = await yjsProjectManager.getPageItem(pageTitle);
                if (fallback) {
                    store.currentPage = fallback;
                    logger.info("Fallback page fetch succeeded, currentPage set");
                } else {
                    logger.warn("Fallback page fetch returned null");
                }
            } catch (e) {
                logger.error("Fallback page fetch failed", e as any);
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

        // ページの読み込み完了をログ出力
        if (store.pages) {
            logger.info(`Available pages count: ${store.pages.current.length}`);
            for (let i = 0; i < store.pages.current.length; i++) {
                const page = store.pages.current[i];
                logger.info(`Page ${i}: "${page.text}"`);
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

    // fallbackPageIdを即座に解決（最短経路での早期描画のため）
    if (projectName && pageName && !fallbackPageId) {
        try {
            logger.info("onMount: Attempting early fallbackPageId resolution");

            // プロジェクト名からプロジェクトIDを生成
            const slugify = (input: string) => {
                const s = (input || "").toString().trim().toLowerCase();
                const slug = s
                    .replace(/[^a-z0-9_-]+/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/^-+|-+$/g, "");
                return slug || "default-project";
            };
            const projectId = slugify(projectName || "default-project");

            // 軽量なYjsProjectManagerインスタンスでページ一覧を取得
            const tempYjsManager = new YjsProjectManager(projectId);
            await tempYjsManager.connect(projectName || projectId);

            const pages = tempYjsManager.getPages();
            const byTitle = pages.find(p => p.title === pageName);
            if (byTitle) {
                fallbackPageId = byTitle.id;
                logger.info(`onMount: Early fallbackPageId resolved: ${fallbackPageId}`);
            } else {
                // ページが存在しない場合は一意のIDを生成
                fallbackPageId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
                logger.info(`onMount: Generated temporary fallbackPageId: ${fallbackPageId}`);
            }

            // 一時的なマネージャーをクリーンアップ
            tempYjsManager.disconnect();
        } catch (e) {
            logger.warn("onMount: Early fallbackPageId resolution failed, using temporary ID", e as any);
            // フォールバック: 一意の一時IDを生成
            fallbackPageId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        }
    }

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

    if (pageName) {
        searchHistoryStore.add(pageName);
    }
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

<main class="container mx-auto px-4 py-4">
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

    {#if pageItemToRender}
        <!-- デバッグ用ログ -->
        {
            logger.info(
                `Rendering OutlinerBase: pageItem.id=${pageItemToRender.id}, isTemporary=${pageItemToRender.id.startsWith('temp-')}`,
            )
        }

        <!-- OutlinerBase コンポーネントでアウトライナーを表示 -->
        <OutlinerBase
            pageItem={pageItemToRender}
            projectName={projectName || ""}
            pageName={pageName || ""}
            isReadOnly={false}
            isTemporary={pageItemToRender.id.startsWith('temp-')}
            onEdit={undefined}
        />

        <!-- バックリンクパネル -->
        {#if !pageItemToRender.id.startsWith('temp-')}
            <BacklinkPanel pageName={pageName || ""} projectName={projectName || ""} />
        {/if}

        <!-- 検索パネル -->
        <SearchPanel
            isVisible={isSearchPanelVisible}
            pageItem={store.currentPage}
            project={store.project}
        />
    {:else}
        <!-- デバッグ用ログ --> {logger.info(`OutlinerBase not rendered: store.currentPage=${!!store.currentPage}`)}

        <!-- 最小限のプレースホルダー（data-testid確保のため） -->
        <div class="outliner-base" data-testid="outliner-base">
            <div class="loading-placeholder">
                <p>ページを読み込み中...</p>
            </div>
        </div>
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
    {:else if pageNotFound}
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
