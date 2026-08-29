<script lang="ts">
    import Loader from "../../../components/Loader.svelte";
    import { resolvePath } from "../../../utils/pathUtils";
    // Use SvelteKit page store from $app/stores (not $app/state)
    import { page } from "$app/stores";
import { goto } from "$app/navigation";
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
    import type { Project as AppProject } from "../../../schema/app-schema";
    import { iterateItems } from "../../../utils/itemTraversal";
import { safeDecodeURIComponent } from "../../../utils/urlUtils";
    import { findPageByName as sharedFindPageByName } from "../../../utils/pageUtils";
    import { projectPagePath } from "../../../lib/publicProject";
    import { projectGraphPath } from "../../../lib/managementPaths";
    import { getYjsClientByProjectTitle } from "../../../services";
    const logger = getLogger("+page");

    import { yjsStore } from "../../../stores/yjsStore.svelte";
    import { searchHistoryStore } from "../../../stores/SearchHistoryStore.svelte";
    import { pageViewStore } from "../../../stores/PageViewStore.svelte";
    import { store } from "../../../stores/store.svelte";

    // Get URL parameters (follow SvelteKit page store)
    // NOTE: Must reference the value of $page (not the store object).
    // Previously used page.params.page, which caused TypeError by referencing property while page was unresolved.
    let projectName: string = $derived($page.params.project || "");
    let pageName: string = $derived($page.params.page || "");

    // Debug log
    // logger at init; avoid referencing derived vars outside reactive contexts to silence warnings

    // Page state
    let error: string | undefined = $state(undefined);
    let _isLoading = $state(true);
    let isAuthenticated = $state(false);
    let pageNotFound = $state(false);
    let lastReset = $state(0);

    $effect(() => {
        if (store.project) {
            const meta = store.project.ydoc.getMap("metadata");
            const updateReset = () => {
                lastReset = (meta.get("lastReset") as number) ?? 0;
            };
            updateReset();
            meta.observe(updateReset);
            return () => meta.unobserve(updateReset);
        }
    });

    let isSearchPanelVisible = $state(false); // Search panel visibility state

    // Optional variable for pending imports - defined to avoid ESLint no-undef errors
    // This is used in conditional checks and may be set by external code
    let _pendingImport: unknown[] | undefined;
    let _project: AppProject;

    // Monitor and update URL parameters and auth state
    // Key to avoid multiple executions under the same conditions and prevent Svelte update depth exceeded
    // Note: Using $state causes a loop where $effect reads/writes its own dependency, so use a normal variable
    let lastLoadKey: string | null = null;
    let __loadingInProgress = false; // Re-entry prevention

    // Identity of the page the current URL addresses.
    // A title rename mutates this very item, so the URL has to follow the item
    // instead of the route being resolved by the old name again. Keeping the key
    // and the title the route was resolved with makes a rename ("same item, new
    // title") distinguishable from a navigation ("different item").
    // Plain variables on purpose: these are written from within $effect and must
    // not feed back into reactivity.
    let routedPageKey: string | undefined;
    let routedPageTitle: string | undefined;

    /** The title stored on an item, trimmed. */
    function titleOf(item: import("../../../schema/app-schema").Item | undefined): string {
        if (!item) return "";
        try {
            const raw = typeof item.text?.toString === "function"
                ? item.text.toString()
                : String(item.text ?? "");
            return raw.trim();
        } catch (_e) {
            return "";
        }
    }

    /**
     * Whether a route segment addresses `title`. SvelteKit hands params over
     * already decoded, but a segment that survived encoding is tolerated too so
     * the comparison matches `findPageByName`.
     */
    function namesEqual(title: string, routeSegment: string): boolean {
        const t = title.trim().toLowerCase();
        if (!t) return false;
        const raw = routeSegment.trim().toLowerCase();
        return t === raw
            || t === safeDecodeURIComponent(routeSegment).trim().toLowerCase();
    }

    /** Remember which item the URL currently stands for. */
    function markRoutedPage(item: import("../../../schema/app-schema").Item | undefined) {
        routedPageKey = item?.key;
        routedPageTitle = titleOf(item);
    }

    /**
     * True when the route already points at the page that is open — the state a
     * title rename leaves behind once the URL has followed the new title.
     */
    function routeMatchesActivePage(pj: string, pg: string): boolean {
        const cp = store.currentPage;
        if (!cp || !store.project || routedPageKey === undefined || cp.key !== routedPageKey) {
            return false;
        }
        if (!namesEqual(String(store.project.title ?? ""), pj)) return false;
        return namesEqual(titleOf(cp), pg);
    }

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

        if (routeMatchesActivePage(pj, pg)) {
            // The renamed page is already the open one. Reloading here would drop
            // the edited item on the floor and flash "Page not found" while the
            // project is re-resolved under a name that no longer exists.
            logger.info(
                `scheduleLoadIfNeeded: route followed a rename to "${pg}", keeping the open page`,
            );
            lastLoadKey = key;
            routedPageTitle = titleOf(store.currentPage);
            pageNotFound = false;
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
        _isLoading = true;
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
            yjsStore.yjsClient = client as unknown as import("../../../yjs/YjsClient").YjsClient;
            const project = client.getProject?.();

            if (!project) {
                throw new Error("Project data not found in client");
            }
            store.project = project as unknown as AppProject;
            logger.info(
                `loadProjectAndPage: Project loaded: "${project.title}"`,
            );

            // 3. Search and identify page
            // const items = project?.items; // Moved inside findPage for freshness
            let targetPage: import("../../../schema/app-schema").Item | null | undefined = null;

            // Helper to find page by name
            const findPage = () => {
                if (!project?.items) return null;
                const found = sharedFindPageByName(project.items as unknown as Iterable<import("../../../schema/app-schema").Item>, pageName);

                if (!found) {
                    const titles: string[] = [];
                    for (const p of iterateItems(project.items) as Iterable<{ text?: { toString?: () => string } }>) {
                        if (!p) continue;
                        try {
                            titles.push(typeof p.text?.toString === "function" ? p.text.toString() : String(p.text ?? ""));
                        } catch (_e) {
                            titles.push("");
                        }
                    }
                    if (titles.length > 0) {
                        logger.info(`loadProjectAndPage: findPage did not find "${pageName}". Found ${titles.length} items: ${titles.slice(0, 5).join(", ")}${titles.length > 5 ? '...' : ''}`);
                    }
                }
                return found as import("../../../schema/app-schema").Item | null;
            };

            targetPage = findPage();

            // Retry for eventual consistency (especially in tests where data is seeded via API)
            if (!targetPage) {
                logger.info(
                    `loadProjectAndPage: Page "${pageName}" not found initially. Retrying...`,
                );
                // Wait up to 15 seconds (150 * 100ms) for Yjs to sync in tests, or 0.5s otherwise
                const maxRetries = import.meta.env.MODE === 'test' ? 150 : 5;
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
                        const items = project?.items;
                        const len = items?.length ?? 0;
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
                store.currentPage = targetPage;
                markRoutedPage(store.currentPage);

                // Wait for page list store update (optional)
                if (!store.pages) {
                    // Might need to wait a bit to get page list on initial load
                    // But basic display is sufficient with currentPage
                }
            } else {
                // If creation failed, etc.
                routedPageKey = undefined;
                routedPageTitle = undefined;
                pageNotFound = true;
                logger.info(`loadProjectAndPage: Page "${pageName}" not found or failed to create`);
            }
        } catch (err) {
            logger.error({ error: err }, "Failed to load project and page:");
            error =
                err instanceof Error
                    ? err.message
                    : "An error occurred while loading the project and page.";
        } finally {
            _isLoading = false;
            __loadingInProgress = false;
            if (typeof window !== "undefined") {
                if (import.meta.env.MODE === "test" || window.__E2E__) {
                    window.__PAGE_STATE__ = {
                        loaded: true,
                        projectName,
                        pageName,
                        hasProject: !!store.project,
                        hasCurrentPage: !!store.currentPage,
                        pageNotFound,
                        error,
                    };
                }
            }
            try {
                capturePageIdForSchedule();
            } catch (_e) { logger.error(_e); }
        }
    }

    onMount(() => {
        try {
            logger.debug("[DEBUG] onMount called");
        } catch (e) {
            logger.error({ error: e }, "[DEBUG] onMount error:");
        }
    });


    // Sync the URL when the open page is renamed.
    //
    // `Item.text` reads straight through to Yjs, so it carries no reactivity of
    // its own: an in-place rename is only observable through the store's pages
    // signal. The rename is attributed to the item the route was resolved with,
    // which keeps a stale `currentPage` during a navigation from dragging the
    // URL back to the page being left.
    $effect(() => {
        void store.pagesVersion;

        const cp = store.currentPage;
        if (!cp || !pageName || __loadingInProgress) return;
        if (routedPageKey === undefined || cp.key !== routedPageKey) return;

        let title = titleOf(cp);
        if (!title) title = "Untitled";
        if (!title || title === routedPageTitle) return;

        const previousTitle = routedPageTitle;
        routedPageTitle = title;
        if (namesEqual(title, pageName)) return;

        const newRoute = resolvePath(projectPagePath(projectName, title));
        logger.info(`Title changed from "${previousTitle}" to "${title}", updating URL to ${newRoute}`);
        if (previousTitle) {
            searchHistoryStore.rename(previousTitle, title);
            pageViewStore.rename(previousTitle, title);
        }
        // Svelte-managed navigation, replacing the entry so a rename does not
        // pile up history, and keeping focus so typing the next character is
        // not interrupted.
        goto(newRoute, { replaceState: true, keepFocus: true, noScroll: true });
    });

    // Monitor route parameter changes reactively
    $effect(() => {
        // Track projectName and pageName changes
        scheduleLoadIfNeeded({ project: projectName, page: pageName });
    });

    // React to page list changes to ensure we stay on the same instance
    $effect(() => {
        void store.pagesVersion;

        try { capturePageIdForSchedule(); } catch (_e) { logger.error(_e); }

        if (!__loadingInProgress && !error && store.currentPage && store.project) {
            const findPageEffect = () => {
                const items = store.project?.items;
                if (!items) return null;
                return sharedFindPageByName(items as unknown as Iterable<import("../../../schema/app-schema").Item>, pageName) as import("../../../schema/app-schema").Item | null;
            };
            const latestPage = findPageEffect();
            if (latestPage && latestPage.key !== store.currentPage.key) {
                logger.info(`Page instance changed for "${pageName}", updating currentPage`);
                store.currentPage = latestPage;
                markRoutedPage(store.currentPage);
            }
        }
    });
    // For schedule integration: Save pageId candidate from current page to session
    function capturePageIdForSchedule() {
        try {
            if (typeof window === "undefined") return;
            const pg = store.currentPage;
            if (!pg) return;

            // Always use the page ID itself, not its children
            // This ensures consistency regardless of page content (empty vs populated)
            const id = pg.id;

            if (id) {
                const key = `schedule:lastPageChildId:${encodeURIComponent(projectName)}:${encodeURIComponent(pageName)}`;
                window.sessionStorage?.setItem(key, String(id));
                logger.debug(
                    "[+page.svelte] capturePageIdForSchedule saved:",
                    key,
                    id,
                );
            }
        } catch (_e) { logger.error(_e); }
    }


    // Return to Project Page

    function createPage() {
        if (!store.project || !pageName) return;
        try {
            const currentUserId = userManager.getCurrentUser()?.id || "anonymous";
            if (store.pageExists(pageName)) return;
            const created = store.project.addPage(pageName, currentUserId);
            if (created) {
                store.currentPage = created;
                markRoutedPage(store.currentPage);
                pageNotFound = false;
                scheduleLoadIfNeeded({ project: projectName, page: pageName });
            }
        } catch (e) {
            logger.warn("createPage failed", e);
        }
    }

    // Toggle search panel display
    function toggleSearchPanel() {
        const before = isSearchPanelVisible;
        isSearchPanelVisible = !isSearchPanelVisible;
        logger.debug(
            `toggleSearchPanel called: ${JSON.stringify({
                before,
                after: isSearchPanelVisible,
            })}`,
        );
    }

    onMount(() => {
        const init = async () => {
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
            if (import.meta.env.MODE === "test" || window.__E2E__) {
                window.__OPEN_SEARCH__ = async () => {
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
        }

        // Setup link preview handlers after page load
        // Wait for DOM to be fully loaded
        setTimeout(() => {
            setupLinkPreviewHandlers();
        }, 500);

        if (pageName) {
            searchHistoryStore.add(pageName);
            pageViewStore.increment(pageName);
        }
        };
        init();
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

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <!-- Page identity lives in two places only: the global toolbar names the
             project, the editor below owns the editable page title. This row
             carries actions, never identity. -->
        <div class="flex items-center justify-end">
            <div class="flex items-center space-x-2" data-testid="page-toolbar">
                <button type="button"
                    onclick={toggleSearchPanel}
                    class="search-btn px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    data-testid="search-toggle-button"
                    aria-label="Toggle Search Panel"
                    aria-expanded={isSearchPanelVisible}
                >
                    Search
                </button>
                <a href={resolvePath(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}/schedule`)} class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 inline-block text-center" style="text-decoration:none; display:inline-flex; align-items:center;">Schedule</a>
                <a href={resolvePath(projectGraphPath(projectName))} data-testid="graph-view-button" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block text-center" style="text-decoration:none; display:inline-flex; align-items:center;">Graph View</a>
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

    {#if _isLoading && !store.currentPage}
        <div class="py-8"><Loader message="Loading Page..." /></div>
    {:else if !error}
        <!-- Always mount OutlinerBase, switch display internally based on pageItem presence -->
        {#key lastReset}
            <OutlinerBase
                pageItem={store.currentPage}
                projectName={projectName || ""}
                pageName={pageName || ""}
                isReadOnly={false}
                onEdit={undefined}
            />
        {/key}
    {/if}

    <!-- Backlink Panel (Hidden when temporary page) -->
    {#if store.currentPage && !store.currentPage.id.startsWith("temp-")}
        {#key lastReset}
            <BacklinkPanel {pageName} {projectName} />
        {/key}
    {/if}

    <!-- Search Panel -->
    <SearchPanel
        isVisible={isSearchPanelVisible}
        pageItem={store.currentPage}
        project={store.project}
        onclose={() => { if (isSearchPanelVisible) toggleSearchPanel(); }}
    />
    {#if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h2 class="text-sm font-medium text-red-800">
                        An error occurred
                    </h2>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button type="button"
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
                    <h2 class="text-sm font-medium text-yellow-800">
                        Page not found
                    </h2>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>
                            The specified page "{pageName}" does not exist in project "{projectName}".
                        </p>
                    </div>
                    {#if isAuthenticated}
                        <div class="mt-4">
                            <button type="button"
                                onclick={createPage}
                                class="rounded-md bg-blue-100 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                            >
                                Create Page
                            </button>
                        </div>
                    {/if}
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
                    <h2 class="text-sm font-medium text-blue-800">
                        Login required
                    </h2>
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


