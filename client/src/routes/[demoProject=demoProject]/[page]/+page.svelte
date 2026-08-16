<script lang="ts">
    import Loader from "../../../components/Loader.svelte";
    import { page } from "$app/stores";
    import { resolvePath } from "../../../utils/pathUtils";
    import { onDestroy, untrack } from "svelte";
    import BacklinkPanel from "../../../components/BacklinkPanel.svelte";
    import OutlinerBase from "../../../components/OutlinerBase.svelte";
    import SearchPanel from "../../../components/SearchPanel.svelte";
    import { DemoInitAborted, initializeDemoProject, releaseDemoProject } from "../../../lib/demoInit";
    import { getLogger } from "../../../lib/logger";
    import { projectBasePath } from "../../../lib/publicProject";
    import type { Item } from "../../../schema/app-schema";
import { findPageByName as sharedFindPageByName } from "../../../utils/pageUtils";
    import { store } from "../../../stores/store.svelte";
    import { yjsStore } from "../../../stores/yjsStore.svelte";
    import Breadcrumb from "../../../components/Breadcrumb.svelte";

    const logger = getLogger("DemoPageView");

    let pageName: string = $derived($page.params.page || "");
    // Which demo project this route is showing (`demo`, `demo-ja`, …).
    let demoProject: string = $derived($page.params.demoProject as string);

    let isLoading = $state(true);
    let error: string | undefined = $state(undefined);
    let seedWarning: string | undefined = $state(undefined);
    let pageNotFound = $state(false);
    let lastReset = $state(0);
    let isServerResetting = $state(false);
    let isSearchPanelVisible = $state(false);
    let isDestroyed = false;

    $effect(() => {
        if (store.project) {
            const meta = store.project.ydoc.getMap("metadata");
            let resetTimeout: ReturnType<typeof setTimeout>;

            const updateReset = () => {
                lastReset = (meta.get("lastReset") as number) ?? 0;

                const isResetting = meta.get("isResetting");
                const resetStartedAt = meta.get("resetStartedAt") as number | undefined;
                const now = Date.now();
                clearTimeout(resetTimeout);

                if (isResetting && resetStartedAt && now - resetStartedAt < 60000) {
                    isServerResetting = true;
                    resetTimeout = setTimeout(updateReset, 60000 - (now - resetStartedAt));
                } else {
                    isServerResetting = false;
                }
            };
            updateReset();
            meta.observe(updateReset);
            return () => {
                clearTimeout(resetTimeout);
                meta.unobserve(updateReset);
            };
        }
    });

    function findPage(name: string): Item | undefined {
        if (!store.project?.items) return undefined;
        return sharedFindPageByName(store.project.items, name) || undefined;
    }

    // The project whose reference this route holds. Captured here because
    // `$derived` is not readable from onDestroy, and the release must name the
    // same project the acquire did.
    let acquiredProject = "";

    async function loadDemoPage() {
        try {
            acquiredProject = demoProject;
            isLoading = true;
            error = undefined;
            pageNotFound = false;
            store.currentPage = undefined;

            // Connect once; page switches within /demo reuse the same client
            if (!yjsStore.yjsClient || !store.project) {
                // Connects immediately; freshness validation runs in parallel.
                await initializeDemoProject(demoProject, {
                    isDestroyed: () => isDestroyed,
                    onValidated: (update) => {
                        seedWarning = update.seedFailure === "network"
                            ? "Can't reach the demo server — retrying..."
                            : undefined;
                    },
                });
            }

            // Let the $effect block handle page resolution and sync state
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err instanceof Error ? err : new Error(String(err)) }, "Failed to load demo page");
            error = err instanceof Error ? err.message : "An error occurred while loading the demo page.";
        } finally {
            isLoading = false;
        }
    }

    function toggleSearchPanel() {
        isSearchPanelVisible = !isSearchPanelVisible;
    }

    function createDemoPage() {
        if (isServerResetting) return;
        if (!store.project || !pageName) return;

        if (store.pageExists(pageName)) {
            const existingPage = findPage(pageName);
            if (existingPage) {
                store.currentPage = existingPage;
                pageNotFound = false;
                return;
            }
        }

        const created = store.project.addPage(pageName, "anonymous");
        if (created) {
            store.currentPage = created;
            pageNotFound = false;
        }
    }

    // Follow route parameter changes (e.g. internal links between demo pages)
    let lastLoaded: string | undefined;
    $effect(() => {
        const currentName = pageName;
        if (!currentName) return;

        if (currentName !== lastLoaded) {
            lastLoaded = currentName;
            untrack(() => loadDemoPage());
        }
    });

    // React to page list changes (e.g., initial sync or demo reset recreating the page)
    $effect(() => {
        void store.pagesVersion;
        const isSyncing = yjsStore.notYetSynced;

        if (!isLoading && !error && store.project && pageName) {
            const targetPage = findPage(pageName);

            if (targetPage) {
                if (!store.currentPage || targetPage.key !== store.currentPage.key) {
                    logger.info(`Page instance resolved for "${pageName}", updating currentPage`);
                    store.currentPage = targetPage;
                    pageNotFound = false;
                }
            } else if (!isSyncing) {
                // Done syncing and still not found
                store.currentPage = undefined;
                pageNotFound = true;
            }
        }
    });

    onDestroy(() => {
        isDestroyed = true;
        try {
            releaseDemoProject(acquiredProject);
        } catch (_e) { logger.error(_e); }
    });
</script>

<svelte:head>
    <title>{pageName ? pageName : "Page"} - Demo | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: "Demo Project", href: projectBasePath(demoProject) },
            { label: pageName }
        ]} />

        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">
                <span class="text-gray-600">{demoProject} /</span>
                {pageName}
            </h1>
            <div class="flex items-center space-x-2" data-testid="demo-page-toolbar">
                <button type="button"
                    onclick={toggleSearchPanel}
                    class="search-btn px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    data-testid="search-toggle-button"
                    aria-label="Toggle Search Panel"
                    aria-expanded={isSearchPanelVisible}
                >
                    Search
                </button>
                <a href={resolvePath(`${projectBasePath(demoProject)}/graph`)} data-testid="graph-view-button" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-block text-center" style="text-decoration:none; display:inline-flex; align-items:center;">Graph View</a>
            </div>
        </div>
        <p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo space. Content resets every 24 hours.
        </p>
        {#if seedWarning}
            <!-- Non-blocking: freshness validation failed, but already-synced
                 demo content stays visible below. -->
            <p class="mt-1 text-sm text-red-600" data-testid="demo-seed-warning" role="status" aria-live="assertive">
                {seedWarning}
            </p>
        {/if}
    </div>

    {#if isServerResetting}
        <div class="rounded-md bg-blue-50 p-4" role="alert" aria-live="polite">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-blue-400">ℹ️</span>
                </div>
                <div class="ml-3">
                    <h2 class="text-sm font-medium text-blue-800">Demo content is being reset</h2>
                    <div class="mt-2 text-sm text-blue-700">
                        <p>The demo content is currently being reset. Please wait a moment while the server restores the template pages. Editing is temporarily paused.</p>
                    </div>
                </div>
            </div>
        </div>
    {:else if (isLoading || (yjsStore.notYetSynced && !yjsStore.syncError && !store.currentPage)) && !error && !pageNotFound}
        <div class="py-8"><Loader message="Loading Demo..." /></div>
    {:else if error || yjsStore.syncError}
        <div class="rounded-md bg-red-50 p-4" role="alert" aria-live="assertive">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h2 class="text-sm font-medium text-red-800">An error occurred</h2>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error || "Connection to the real-time server failed or timed out."}</p>
                    </div>
                    <div class="mt-4">
                        <button type="button"
                            onclick={() => { if (yjsStore.syncError) void yjsStore.reconnect(); void loadDemoPage(); }}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if pageNotFound}
        <div class="rounded-md bg-yellow-50 p-4" role="alert" aria-live="assertive">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-yellow-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h2 class="text-sm font-medium text-yellow-800">Page not found</h2>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>The page "{pageName}" does not exist in the demo project.</p>
                    </div>
                    <div class="mt-4">
                        <button type="button"
                            onclick={createDemoPage}
                            class="rounded-md bg-blue-100 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                        >
                            Create Page
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if store.currentPage}
        {#key `${lastReset}-${store.currentPage.id}`}
            <OutlinerBase
                pageItem={store.currentPage}
                projectName={demoProject}
                pageName={pageName}
                isReadOnly={false}
                onEdit={undefined}
            />

            <!-- Backlink Panel -->
            <BacklinkPanel {pageName} projectName={demoProject} />
        {/key}
    {/if}

    <!-- Search Panel -->
    <SearchPanel
        isVisible={isSearchPanelVisible}
        pageItem={store.currentPage}
        project={store.project}
        onclose={() => { if (isSearchPanelVisible) toggleSearchPanel(); }}
    />
</main>


