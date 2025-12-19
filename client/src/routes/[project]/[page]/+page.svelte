<script lang="ts">
import { goto } from "$app/navigation";
// Use SvelteKit page store from $app/stores (not $app/state)
import { page } from "$app/stores";
import {
    onDestroy,
    onMount
} from "svelte";
import { browser } from "$app/environment";

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
const logger = getLogger("+page"); // eslint-disable-line @typescript-eslint/no-unused-vars

import { searchHistoryStore } from "../../../stores/SearchHistoryStore.svelte";
import { store } from "../../../stores/store.svelte";
import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";

// URL parameters via SvelteKit page store
let projectName: string = $derived.by(() => $page.params.project ?? "");
let pageName: string = $derived.by(() => $page.params.page ?? "");

// Page state
let isLoading = $state(true);
let isAuthenticated = $state(false);
let pageNotFound = $state(false);
let isSearchPanelVisible = $state(false);

// E2E helper: check skip seeding
function shouldSkipTestSeed(): boolean {
    try {
        return typeof window !== "undefined" &&
            window.localStorage?.getItem?.("SKIP_TEST_CONTAINER_SEED") === "true";
    } catch { return false; }
}

// Sync loading state with global store
$effect(() => {
    // When URL params change, reset loading state
    isLoading = true;
    pageNotFound = false;
});

$effect(() => {
    if (store.currentPage && store.project) {
        // Ensure the current page matches the URL before clearing loading state
        const title = store.currentPage.text?.toString?.() ?? String(store.currentPage.text ?? "");
        if (title.toLowerCase() === pageName.toLowerCase()) {
            isLoading = false;
            pageNotFound = false;
        }
    }
});

onMount(() => {
    if (!browser) return;

    isAuthenticated = userManager.getCurrentUser() !== null;
    const unsubAuth = userManager.addEventListener((user: any) => {
        isAuthenticated = user !== null;
    });

    // Add to search history
    if (pageName) {
        searchHistoryStore.add(pageName);
    }

    // Link preview handlers
    setTimeout(() => setupLinkPreviewHandlers(), 500);

    // E2E stabilization: capture pageId for schedule periodically at start
    let iv: any;
    try {
        let tries = 0;
        iv = setInterval(() => {
            try {
                capturePageIdForSchedule();
                const pg: any = store.currentPage as any;
                const len = pg?.items?.length ?? 0;
                if (len > 0 || ++tries > 50) {
                    clearInterval(iv);
                }
            } catch {
                if (++tries > 50) clearInterval(iv);
            }
        }, 100);
    } catch {}

    // E2E helper: expose search panel toggle to window
    (window as any).__OPEN_SEARCH__ = async () => {
        if (!isSearchPanelVisible) toggleSearchPanel();
        let tries = 0;
        while (!document.querySelector('[data-testid="search-panel"]') && tries < 40) {
            await new Promise(r => setTimeout(r, 25));
            tries++;
        }
        (window as any).__SEARCH_PANEL_VISIBLE__ = true;
    };

    return () => {
        unsubAuth();
        cleanupLinkPreviews();
        if (iv) clearInterval(iv);
    };
});

// Capture page ID for scheduling (E2E support)
function capturePageIdForSchedule() {
    try {
        if (!browser) return;
        const pg = store.currentPage;
        if (!pg) return;
        
        const title = pg.text?.toString?.() ?? String(pg.text ?? "");
        if (pageName && title.toLowerCase() !== pageName.toLowerCase()) return;

        const id = pg.id;
        if (id) {
            const key = `schedule:lastPageChildId:${encodeURIComponent(projectName)}:${encodeURIComponent(pageName)}`;
            window.sessionStorage?.setItem(key, String(id));
        }
    } catch {}
}

// Navigation helpers
function goHome() { goto("/"); }
function goToProject() { goto(`/${encodeURIComponent(projectName)}`); }
function goToSchedule() { goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}/schedule`); }
function goToGraphView() { goto(`/${encodeURIComponent(projectName)}/graph`); }

// Toolbar button logic (E2E support)
function addItemFromTopToolbar() {
    try {
        let pageItem = store.currentPage;
        if (!pageItem && store.project && pageName) {
            const items = (store.project as any).items;
            if (items?.addNode) {
                const created = items.addNode("tester");
                created.updateText?.(pageName);
                store.currentPage = created;
                pageItem = created;
            }
        }
        if (!pageItem || !pageItem.items) return;
        const user = userManager.getCurrentUser()?.id ?? "tester";
        const node = pageItem.items.addNode(user);
        if (node?.id) {
            editorOverlayStore.setCursor({ itemId: node.id, offset: 0, isActive: true, userId: "local" });
            editorOverlayStore.setActiveItem(node.id);
        }
    } catch (e) {
        console.warn("addItemFromTopToolbar failed", e);
    }
}

function toggleSearchPanel() {
    isSearchPanelVisible = !isSearchPanelVisible;
    if (browser) (window as any).__SEARCH_PANEL_VISIBLE__ = isSearchPanelVisible;
}

onDestroy(() => {
    cleanupLinkPreviews();
});
</script>

<svelte:head>
    <title>
        {pageName ? pageName : "ページ"} - {
            projectName
            ? projectName
            : "プロジェクト"
        } | Outliner
    </title>
</svelte:head>

<main class="container mx-auto px-4 py-4">
    <div class="mb-4">
        <!-- パンくずナビゲーション -->
        <nav class="mb-2 flex items-center text-sm text-gray-600">
            <button
                onclick={goHome}
                class="text-blue-600 hover:text-blue-800 hover:underline"
                data-testid="breadcrumb-home"
            >
                ホーム
            </button>
            {#if projectName}
                <span class="mx-2">/</span>
                <button
                    onclick={goToProject}
                    class="text-blue-600 hover:text-blue-800 hover:underline"
                    data-testid="breadcrumb-project"
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
            <div class="flex items-center space-x-2" data-testid="page-toolbar">

                <button
                    onclick={toggleSearchPanel}
                    class="search-btn px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    data-testid="search-toggle-button"
                >
                    検索
                </button>
                <button
                    onclick={addItemFromTopToolbar}
                    class="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300"
                >
                    アイテム追加
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
        <AuthComponent />
    </div>

    <!-- OutlinerBase は常にマウントし、内部で pageItem の有無に応じて表示を切り替える -->
    <OutlinerBase
        pageItem={store.currentPage}
        projectName={projectName || ""}
        pageName={pageName || ""}
        isReadOnly={false}
        isTemporary={store.currentPage ? store.currentPage.id.startsWith('temp-') : false}
        onEdit={undefined}
    />

    <!-- バックリンクパネル（仮ページのときは非表示） -->
    {#if store.currentPage && !store.currentPage.id.startsWith('temp-')}
        <BacklinkPanel {pageName} {projectName} />
    {/if}

    <!-- 検索パネル -->
    <SearchPanel
        isVisible={isSearchPanelVisible}
        pageItem={store.currentPage}
        project={store.project}
    />
    {#if isLoading}
        <div class="flex justify-center py-8">
            <div class="loader">読み込み中...</div>
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
    {:else if !isAuthenticated && !shouldSkipTestSeed()}
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
        <!-- no-op: avoid misleading SSR/hydration fallback message -->
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
