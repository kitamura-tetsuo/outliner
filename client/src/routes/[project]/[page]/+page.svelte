<script lang="ts">
    import { goto } from "$app/navigation";
    // Use SvelteKit page store from $app/stores (not $app/state)
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";

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
    import { getYjsClientByProjectTitle } from "../../../services";
    const logger = getLogger("+page");

    import { yjsStore } from "../../../stores/yjsStore.svelte";
    import { searchHistoryStore } from "../../../stores/SearchHistoryStore.svelte";
    import { store } from "../../../stores/store.svelte";
    import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";

    // URLパラメータを取得（SvelteKit page store に追従）
    // NOTE: `$page` の値を参照する必要がある（store オブジェクトではなく値）。
    // 以前は `page.params.page` としていたため、`page` が未解決のまま property 参照して TypeError になっていた。
    let projectName: string = $derived.by(() => $page.params.project ?? "");
    let pageName: string = $derived.by(() => $page.params.page ?? "");

    // デバッグ用ログ
    // logger at init; avoid referencing derived vars outside reactive contexts to silence warnings

    // ページの状態
    let error: string | undefined = $state(undefined);
    let isLoading = $state(true);
    let isAuthenticated = $state(false);
    let pageNotFound = $state(false);

    let isSearchPanelVisible = $state(false); // 検索パネルの表示状態

    // Optional variable for pending imports - defined to avoid ESLint no-undef errors
    // This is used in conditional checks and may be set by external code
    let pendingImport: any[] | undefined; // eslint-disable-line @typescript-eslint/no-unused-vars
    let project: any; // eslint-disable-line @typescript-eslint/no-unused-vars

    // URLパラメータと認証状態を監視して更新
    // 同一条件での多重実行を避け、Svelte の update depth exceeded を回避するためのキー
    // 注意: $state を使うと $effect が自分で読んで書く依存を持ちループになるため、通常変数で保持する
    let lastLoadKey: string | null = null;
    let __loadingInProgress = false; // 再入防止

    /**
     * ロード条件を評価し、必要であればロードを開始する
     */
    function scheduleLoadIfNeeded(opts?: {
        project?: string;
        page?: string;
        authenticated?: boolean;
    }) {
        const pj = (opts?.project ?? projectName) || "";
        const pg = (opts?.page ?? pageName) || "";
        const auth = opts?.authenticated ?? isAuthenticated;

        // 条件未成立
        if (!pj || !pg || !auth) {
            logger.info(
                `scheduleLoadIfNeeded: skip (project="${pj}", page="${pg}", auth=${auth})`,
            );
            return;
        }

        const key = `${pj}::${pg}`;
        if (__loadingInProgress || lastLoadKey === key) {
            return;
        }
        lastLoadKey = key;

        // 反応深度の問題を避けるため、イベントループに委ねる
        setTimeout(() => {
            if (!__loadingInProgress) loadProjectAndPage();
        }, 0);
    }

    // 認証成功時の処理
    function handleAuthSuccess() {
        logger.info("handleAuthSuccess: 認証成功");
        isAuthenticated = true;
        scheduleLoadIfNeeded({ authenticated: true });
    }

    // 認証ログアウト時の処理
    function handleAuthLogout() {
        logger.info("ログアウトしました");
        isAuthenticated = false;
    }

    // プロジェクトとページを読み込む
    async function loadProjectAndPage() {
        logger.info(
            `loadProjectAndPage: Starting for project="${projectName}", page="${pageName}"`,
        );
        __loadingInProgress = true;
        isLoading = true;
        error = undefined;
        pageNotFound = false;

        try {
            // 1. クライアントの取得
            logger.info(
                `loadProjectAndPage: Getting Yjs client for "${projectName}"`,
            );
            let client = await getYjsClientByProjectTitle(projectName);

            if (!client) {
                // User requested NOT to create new project here.
                logger.warn(
                    `loadProjectAndPage: Project client not found for "${projectName}"`,
                );
                throw new Error(
                    `Project "${projectName}" could not be loaded.`,
                );
            }

            if (!client) {
                throw new Error("Failed to load or create project client");
            }

            // 2. ストアの更新
            yjsStore.yjsClient = client as any;
            const project = client.getProject?.();

            if (!project) {
                throw new Error("Project data not found in client");
            }
            store.project = project as any;
            logger.info(
                `loadProjectAndPage: Project loaded: "${project.title}"`,
            );

            // 3. ページの検索・特定
            // const items = project.items as any; // Moved inside findPage for freshness
            let targetPage: any = null;

            // Helper to find page by name
            const findPage = () => {
                const items = project.items as any;
                if (items) {
                    const len =
                        typeof items.length === "function"
                            ? items.length()
                            : (items.length ?? 0);
                    for (let i = 0; i < len; i++) {
                        const p = items.at ? items.at(i) : items[i];
                        const t =
                            p?.text?.toString?.() ?? String(p?.text ?? "");
                        if (
                            String(t).toLowerCase() ===
                            String(pageName).toLowerCase()
                        ) {
                            return p;
                        }
                    }
                }
                return null;
            };

            targetPage = findPage();

            // Retry for eventual consistency (especially in tests where data is seeded via API)
            if (!targetPage) {
                logger.info(
                    `loadProjectAndPage: Page "${pageName}" not found initially. Retrying...`,
                );
                // Wait up to 15 seconds (150 * 100ms) for Yjs to sync
                const maxRetries = 150;
                for (let i = 0; i < maxRetries; i++) {
                    await new Promise((r) => setTimeout(r, 100));
                    targetPage = findPage();
                    if (targetPage) {
                        logger.info(
                            `loadProjectAndPage: Found page "${pageName}" after retry ${i + 1}`,
                        );
                        break;
                    }
                    if (i % 10 === 0 || i === maxRetries - 1) {
                        const items = project.items as any;
                        const len =
                            typeof items?.length === "function"
                                ? items.length()
                                : (items?.length ?? 0);
                        logger.info(
                            `loadProjectAndPage: Retry ${i + 1}/${maxRetries}, items.length=${len}, pageName="${pageName}"`,
                        );
                    }
                }
            }

            // 4. ページが存在しない場合: 自動作成
            // REMOVED: Legacy auto-creation logic.
            // If the page doesn't exist, we should not automatically create it on navigation.
            // This ensures tests fail if seeding was missed, and avoids accidental creation in production.
            if (!targetPage) {
                logger.info(
                    `loadProjectAndPage: Page "${pageName}" not found. skipping auto-creation.`,
                );
            }

            // 5. カレントページの設定とハイドレーション
            if (targetPage) {
                store.currentPage = targetPage as any;

                // アイテムの読み込み (Hydration)
                if (
                    targetPage.id &&
                    typeof project.hydratePageItems === "function"
                ) {
                    logger.info(
                        `loadProjectAndPage: Hydrating items for page ${targetPage.id}`,
                    );
                    await project.hydratePageItems(targetPage.id);
                }

                // ページ一覧のストア更新待機 (オプション)
                if (!store.pages) {
                    // 初回ロード時はページ一覧を取得するまで少し待つことがあるかもしれません
                    // しかし基本的な表示は currentPage があれば十分
                }
            } else {
                // 作成に失敗した場合など
                pageNotFound = true;
                logger.error(
                    `loadProjectAndPage: Failed to find or create page "${pageName}"`,
                );
            }
        } catch (err) {
            console.error("Failed to load project and page:", err);
            error =
                err instanceof Error
                    ? err.message
                    : "プロジェクトとページの読み込み中にエラーが発生しました。";
        } finally {
            isLoading = false;
            __loadingInProgress = false;
            if (typeof window !== "undefined") {
                (window as any).__PAGE_STATE__ = {
                    loaded: true,
                    projectName,
                    pageName,
                    hasProject: !!store.project,
                    hasCurrentPage: !!store.currentPage,
                    pageNotFound,
                    error,
                };
            }
            try {
                capturePageIdForSchedule();
            } catch {}
        }
    }

    onMount(() => {
        try {
            // DIRECT DEBUG: This should appear if onMount is called
            if (typeof console !== "undefined") {
                console.log("[DEBUG] onMount called");
            }
            // 初期ロードを試行
            scheduleLoadIfNeeded();
        } catch (e) {
            console.error("[DEBUG] onMount error:", e);
        }

        // E2E安定化: currentPage.items の初期生成を追跡して pageId を随時キャプチャ
        try {
            let tries = 0;
            const iv = setInterval(() => {
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
            onDestroy(() => {
                try {
                    clearInterval(iv);
                } catch {}
            });
        } catch {}

        // ルートパラメータの変化を監視
        const unsub = page.subscribe(($p) => {
            const pj = $p.params?.project ?? projectName;
            const pg = $p.params?.page ?? pageName;
            scheduleLoadIfNeeded({ project: pj, page: pg });
        });
        onDestroy(unsub);
    });
    // スケジュール連携用: 現在のページから pageId 候補をセッションに保存
    function capturePageIdForSchedule() {
        try {
            if (typeof window === "undefined") return;
            const pg: any = store.currentPage as any;
            if (!pg) return;

            // Always use the page ID itself, not its children
            // This ensures consistency regardless of page content (empty vs populated)
            const id = pg.id;

            if (id) {
                const key = `schedule:lastPageChildId:${encodeURIComponent(projectName)}:${encodeURIComponent(pageName)}`;
                window.sessionStorage?.setItem(key, String(id));
                console.log(
                    "[+page.svelte] capturePageIdForSchedule saved:",
                    key,
                    id,
                );
            }
        } catch {}
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

    // 画面上部からもアイテムを追加できる補助ボタン（E2E安定化用）
    function addItemFromTopToolbar() {
        try {
            let pageItem: any = store.currentPage as any;
            // currentPage が未用意なら、URL の pageName で暫定ページを作成
            if (!pageItem) {
                const proj: any = store.project as any;
                if (proj?.addPage && pageName) {
                    try {
                        const created = proj.addPage(pageName, "tester");
                        if (created) {
                            store.currentPage = created as any;
                            pageItem = created;
                        }
                    } catch {}
                }
            }
            if (!pageItem || !pageItem.items) return;
            const user = userManager.getCurrentUser()?.id ?? "tester";
            const node = pageItem.items.addNode(user);
            // 追加直後にアクティブ化してテストの後工程を安定
            if (node && node.id) {
                editorOverlayStore.setCursor({
                    itemId: node.id,
                    offset: 0,
                    isActive: true,
                    userId: "local",
                });
                editorOverlayStore.setActiveItem(node.id);
            }
        } catch (e) {
            console.warn("addItemFromTopToolbar failed", e);
        }
    }

    // 検索パネルの表示を切り替える
    function toggleSearchPanel() {
        const before = isSearchPanelVisible;
        isSearchPanelVisible = !isSearchPanelVisible;
        if (typeof window !== "undefined") {
            (window as any).__SEARCH_PANEL_VISIBLE__ = isSearchPanelVisible;
        }
        logger.debug(
            `toggleSearchPanel called: ${JSON.stringify({
                before,
                after: isSearchPanelVisible,
            })}`,
        );
    }

    onMount(async () => {
        // UserManagerの認証状態を確認（非同期対応）
        logger.info(
            `onMount: Starting for project="${projectName}", page="${pageName}"`,
        );
        logger.info(
            `onMount: URL params - projectName: "${projectName}", pageName: "${pageName}"`,
        );

        // 初期認証状態を確認
        let currentUser = userManager.getCurrentUser();
        logger.info(
            `onMount: Initial auth check - currentUser exists: ${!!currentUser}`,
        );
        logger.info(`onMount: UserManager instance exists: ${!!userManager}`);

        if (currentUser) {
            isAuthenticated = true;
            logger.info(
                "onMount: User already authenticated, setting isAuthenticated=true",
            );
        } else {
            // 認証状態が変更されるまで待機（テスト環境対応）
            logger.info(
                "onMount: No current user, waiting for authentication...",
            );
            let retryCount = 0;
            const maxRetries = 50; // 5秒間待機

            while (!currentUser && retryCount < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                currentUser = userManager.getCurrentUser();
                retryCount++;

                if (retryCount % 10 === 0) {
                    logger.info(
                        `onMount: Auth check retry ${retryCount}/${maxRetries}`,
                    );
                }
            }

            if (currentUser) {
                isAuthenticated = true;
                logger.info(
                    `onMount: Authentication detected after ${retryCount} retries, setting isAuthenticated=true`,
                );
                // Ensure loading starts after authentication is confirmed
                scheduleLoadIfNeeded();
            } else {
                logger.info(
                    "onMount: No authentication detected after retries, staying unauthenticated",
                );
            }
        }

        logger.info(`onMount: Final authentication status: ${isAuthenticated}`);
        logger.info(
            `onMount: About to complete, $effect should trigger with isAuthenticated=${isAuthenticated}`,
        );

        // E2E デバッグ用: 検索パネルを強制的に開く関数を公開
        if (typeof window !== "undefined") {
            (window as any).__OPEN_SEARCH__ = async () => {
                // 現在非表示のときだけトグルボタンをクリックして開く（二重トグル防止）
                if (!isSearchPanelVisible) {
                    const btn =
                        document.querySelector<HTMLButtonElement>(
                            ".search-btn",
                        );
                    btn?.click();
                }
                // search-panel の DOM 出現を待機
                let tries = 0;
                while (
                    !document.querySelector('[data-testid="search-panel"]') &&
                    tries < 40
                ) {
                    await new Promise((r) => setTimeout(r, 25));
                    tries++;
                }
                (window as any).__SEARCH_PANEL_VISIBLE__ = true;
                logger.debug(
                    `E2E: __OPEN_SEARCH__ ensured visible (no double toggle): ${JSON.stringify(
                        {
                            found: !!document.querySelector(
                                '[data-testid="search-panel"]',
                            ),
                            tries,
                        },
                    )}`,
                );
            };
        }

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
        {pageName ? pageName : "ページ"} - {projectName
            ? projectName
            : "プロジェクト"} | Outliner
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
                    <span class="text-gray-600">{projectName} /</span>
                    {pageName}
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
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    <!-- OutlinerBase は常にマウントし、内部で pageItem の有無に応じて表示を切り替える -->
    <OutlinerBase
        pageItem={store.currentPage}
        projectName={projectName || ""}
        pageName={pageName || ""}
        isReadOnly={false}
        isTemporary={store.currentPage
            ? store.currentPage.id.startsWith("temp-")
            : false}
        onEdit={undefined}
    />

    <!-- バックリンクパネル（仮ページのときは非表示） -->
    {#if store.currentPage && !store.currentPage.id.startsWith("temp-")}
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
