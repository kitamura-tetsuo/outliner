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

    // Get URL parameters (follow SvelteKit page store)
    // NOTE: Must reference the value of $page (not the store object).
    // Previously used page.params.page, which caused TypeError by referencing property while page was unresolved.
    let projectName: string = $derived.by(() => $page.params.project ?? "");
    let pageName: string = $derived.by(() => $page.params.page ?? "");

    // Debug log
    // logger at init; avoid referencing derived vars outside reactive contexts to silence warnings

    // Page state
    let error: string | undefined = $state(undefined);
    let isLoading = $state(true);
    let isAuthenticated = $state(false);
    let pageNotFound = $state(false);

    let isSearchPanelVisible = $state(false); // Search panel visibility state

    // Optional variable for pending imports - defined to avoid ESLint no-undef errors
    // This is used in conditional checks and may be set by external code
    let pendingImport: any[] | undefined; // eslint-disable-line @typescript-eslint/no-unused-vars
    let project: any; // eslint-disable-line @typescript-eslint/no-unused-vars

    // Monitor and update URL parameters and auth state
    // Key to avoid multiple executions under the same conditions and prevent Svelte update depth exceeded
    // Note: Using $state causes a loop where $effect reads/writes its own dependency, so use a normal variable
    let lastLoadKey: string | null = null;
    let __loadingInProgress = false; // Re-entry prevention

    /**
     * Evaluate load conditions and start loading if necessary
     */
    function scheduleLoadIfNeeded(opts?: {
        project?: string;
        page?: string;
        authenticated?: boolean;
    }) {
        const pj = (opts?.project ?? projectName) || "";
        const pg = (opts?.page ?? pageName) || "";
        const auth = opts?.authenticated ?? isAuthenticated;

        // Conditions not met
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

        // Defer to event loop to avoid reactivity depth issues
        setTimeout(() => {
            if (!__loadingInProgress) loadProjectAndPage();
        }, 0);
    }

    // Handle auth success
    function handleAuthSuccess() {
        logger.info("handleAuthSuccess: Auth success");
        isAuthenticated = true;
        scheduleLoadIfNeeded({ authenticated: true });
    }

    // Handle auth logout
    function handleAuthLogout() {
        logger.info("Logged out");
        isAuthenticated = false;
    }

    // Load project and page
    async function loadProjectAndPage() {
        logger.info(
            `loadProjectAndPage: Starting for project="${projectName}", page="${pageName}"`,
        );
        __loadingInProgress = true;
        isLoading = true;
        error = undefined;
        pageNotFound = false;

        try {
            // 1. Get client
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

            // 2. Update store
            yjsStore.yjsClient = client as any;
            const project = client.getProject?.();

            if (!project) {
                throw new Error("Project data not found in client");
            }
            store.project = project as any;
            logger.info(
                `loadProjectAndPage: Project loaded: "${project.title}"`,
            );

            // 3. Search and identify page
            // const items = project.items as any; // Moved inside findPage for freshness
            let targetPage: any = null;

            // Helper to find page by name
            const findPage = () => {
                const items = project.items as any;
                if (items) {
                    const len = (typeof items.length === "function") ? items.length() : (items.length ?? 0);
                    const titles: string[] = [];
                    for (let i = 0; i < len; i++) {
                        const p = items.at ? items.at(i) : items[i];
                        const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                        titles.push(t);
                        if (String(t).toLowerCase() === String(pageName).toLowerCase()) {
                            return p;
                        }
                    }
                    if (len > 0) {
                        console.error(`loadProjectAndPage: findPage failed for "${pageName}". Found ${len} items: ${titles.join(", ")}`);
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

            // 4. If page does not exist: Auto-create
            // REMOVED: Legacy auto-creation logic.
            // If the page doesn't exist, we should not automatically create it on navigation.
            // This ensures tests fail if seeding was missed, and avoids accidental creation in production.
            if (!targetPage) {
                logger.info(
                    `loadProjectAndPage: Page "${pageName}" not found. skipping auto-creation.`,
                );
            }

            // 5. Set current page and hydration
            if (targetPage) {
                store.currentPage = targetPage as any;

                // Load items (Hydration)
                if (
                    targetPage.id &&
                    typeof project.hydratePageItems === "function"
                ) {
                    logger.info(
                        `loadProjectAndPage: Hydrating items for page ${targetPage.id}`,
                    );
                    await project.hydratePageItems(targetPage.id);
                }

                // Wait for page list store update (optional)
                if (!store.pages) {
                    // Might need to wait a bit to get page list on initial load
                    // But basic display is sufficient with currentPage
                }
            } else {
                // If creation failed, etc.
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
                    : "An error occurred while loading the project and page.";
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
            // Attempt initial load
            scheduleLoadIfNeeded();
        } catch (e) {
            console.error("[DEBUG] onMount error:", e);
        }

        // E2E Stabilization: Track initial generation of currentPage.items and capture pageId as needed
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

        // Monitor route parameter changes
        const unsub = page.subscribe(($p) => {
            const pj = $p.params?.project ?? projectName;
            const pg = $p.params?.page ?? pageName;
            scheduleLoadIfNeeded({ project: pj, page: pg });
        });
        onDestroy(unsub);
    });
    // For schedule integration: Save pageId candidate from current page to session
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

    // Return to Home
    function goHome() {
        goto("/");
    }

    // Return to Project Page
    function goToProject() {
        goto(`/${projectName}`);
    }

    function goToSchedule() {
        goto(`/${projectName}/${pageName}/schedule`);
    }

    function goToGraphView() {
        goto(`/${projectName}/graph`);
    }

    // Auxiliary button to add items from top of screen (for E2E stabilization)
    function addItemFromTopToolbar() {
        try {
            let pageItem: any = store.currentPage as any;
            // If currentPage is not ready, create provisional page with pageName from URL
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
            // Activate immediately after addition to stabilize subsequent test steps
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

    // Toggle search panel display
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
        // Check UserManager auth state (async support)
        logger.info(
            `onMount: Starting for project="${projectName}", page="${pageName}"`,
        );
        logger.info(
            `onMount: URL params - projectName: "${projectName}", pageName: "${pageName}"`,
        );

        // Check initial auth state
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
            // Wait for auth state change (test environment support)
            logger.info(
                "onMount: No current user, waiting for authentication...",
            );
            let retryCount = 0;
            const maxRetries = 50; // Wait for 5 seconds

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

        // For E2E Debug: Expose function to forcibly open search panel
        if (typeof window !== "undefined") {
            (window as any).__OPEN_SEARCH__ = async () => {
                // Click toggle button to open only when currently hidden (prevent double toggle)
                if (!isSearchPanelVisible) {
                    const btn =
                        document.querySelector<HTMLButtonElement>(
                            ".search-btn",
                        );
                    btn?.click();
                }
                // Wait for search-panel DOM appearance
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

        // Setup link preview handlers after page load
        // Wait for DOM to be fully loaded
        setTimeout(() => {
            setupLinkPreviewHandlers();
        }, 500);

        if (pageName) {
            searchHistoryStore.add(pageName);
        }
    });

    onDestroy(() => {
        // Cleanup link previews
        cleanupLinkPreviews();
    });
</script>

<svelte:head>
    <title>
        {pageName ? pageName : "Page"} - {projectName
            ? projectName
            : "Project"} | Outliner
    </title>
</svelte:head>

<main class="container mx-auto px-4 py-4">
    <div class="mb-4">
        <!-- Breadcrumb Navigation -->
        <nav class="mb-2 flex items-center text-sm text-gray-600">
            <button
                onclick={goHome}
                class="text-blue-600 hover:text-blue-800 hover:underline"
            >
                Home
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

        <!-- Page Title and Search Button -->
        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">
                {#if projectName && pageName}
                    <span class="text-gray-600">{projectName} /</span>
                    {pageName}
                {:else}
                    Page
                {/if}
            </h1>
            <div class="flex items-center space-x-2" data-testid="page-toolbar">
                <button
                    onclick={toggleSearchPanel}
                    class="search-btn px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    data-testid="search-toggle-button"
                >
                    Search
                </button>
                <button
                    onclick={addItemFromTopToolbar}
                    class="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300"
                >
                    Add Item
                </button>
                <button
                    onclick={goToSchedule}
                    class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                    Schedule
                </button>
                <button
                    onclick={goToGraphView}
                    data-testid="graph-view-button"
                    class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                    Graph View
                </button>
            </div>
        </div>
    </div>

    <!-- Auth Component -->
    <div class="auth-section mb-6">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    <!-- Always mount OutlinerBase, switch display internally based on pageItem presence -->
    {#if !error}
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
    {/if}

    <!-- Backlink Panel (Hidden when temporary page) -->
    {#if store.currentPage && !store.currentPage.id.startsWith("temp-")}
        <BacklinkPanel {pageName} {projectName} />
    {/if}

    <!-- Search Panel -->
    <SearchPanel
        isVisible={isSearchPanelVisible}
        pageItem={store.currentPage}
        project={store.project}
    />
    {#if isLoading}
        <div class="flex justify-center py-8">
            <div class="loader">Loading...</div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">
                        An error occurred
                    </h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button
                            onclick={loadProjectAndPage}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            Retry
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
                        Page not found
                    </h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>
                            The specified page "{pageName}" does not exist in project "{projectName}".
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
                        Login required
                    </h3>
                    <div class="mt-2 text-sm text-blue-700">
                        <p>Please login to view this page.</p>
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
