<script lang="ts">
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import BacklinkPanel from "../../../components/BacklinkPanel.svelte";
    import OutlinerBase from "../../../components/OutlinerBase.svelte";
    import SearchPanel from "../../../components/SearchPanel.svelte";
    import { DEMO_PROJECT_NAME, seedDemo } from "../../../lib/demoSeed";
    import { getLogger } from "../../../lib/logger";
    import { getYjsClientByProjectTitle } from "../../../services";
    import type { Item } from "../../../schema/app-schema";
import { findPageByName as sharedFindPageByName } from "../../../utils/pageUtils";
    import { Project as AppProject } from "../../../schema/app-schema";
    import { store } from "../../../stores/store.svelte";
    import { yjsStore } from "../../../stores/yjsStore.svelte";
    import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";
    import Breadcrumb from "../../../components/Breadcrumb.svelte";

    const logger = getLogger("DemoPageView");

    let pageName: string = $derived.by(() => {
        return $page.params.page;
    });

    let isLoading = $state(true);
    let error: string | undefined = $state(undefined);
    let pageNotFound = $state(false);
    let lastReset = $state(0);
    let isSearchPanelVisible = $state(false);
    let isDestroyed = false;

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

    function findPage(name: string): Item | undefined {
        if (!store.project?.items) return undefined;
        return sharedFindPageByName(store.project.items, name) || undefined;
    }

    async function loadDemoPage(name: string) {
        try {
            isLoading = true;
            error = undefined;
            pageNotFound = false;

            // Connect once; page switches within /demo reuse the same client
            if (!yjsStore.yjsClient || !store.project) {
                // Seed demo project via API (no-op when already seeded)
                await seedDemo();
                if (isDestroyed) return;

                const client = await getYjsClientByProjectTitle(DEMO_PROJECT_NAME);
                if (isDestroyed) {
                    client?.dispose();
                    return;
                }
                if (!client) {
                    throw new Error("Failed to connect to the demo project.");
                }
                yjsStore.yjsClient = client;
                store.project = AppProject.fromDoc(client.getProject().ydoc);
            }

            // Wait for sync until the page is found or until synchronization completes
            let targetPage = findPage(name);
            let retries = 0;
            const maxRetries = import.meta.env.MODE === 'test' ? 150 : 300; // Hard limit for safety
            while (!targetPage && retries < maxRetries) {
                await new Promise(r => setTimeout(r, 100));
                if (isDestroyed) return;
                targetPage = findPage(name);
                retries++;
                // Break once synchronized and page is still not found.
                if (!targetPage && !yjsStore.notYetSynced) {
                    break;
                }
            }

            if (!targetPage) {
                logger.warn(`Demo page "${name}" not found after sync wait`);
                pageNotFound = true;
                return;
            }

            store.currentPage = targetPage;
        } catch (err) {
            logger.error({ error: err instanceof Error ? err : new Error(String(err)) }, "Failed to load demo page");
            error = err instanceof Error ? err.message : "An error occurred while loading the demo page.";
        } finally {
            isLoading = false;
        }
    }

    // Auxiliary button to add items from top of screen (for E2E stabilization)
    function addItemFromTopToolbar() {
        try {
            let pageItem = store.currentPage;
            // If currentPage is not ready, create provisional page with pageName from URL
            if (!pageItem) {
                const proj = store.project;
                if (proj?.addPage && pageName) {
                    try {
                        if (store.pageExists(pageName)) return;
                        const created = proj.addPage(pageName, "anonymous");
                        if (created) {
                            store.currentPage = created;
                            pageItem = created;
                        }
                    } catch {}
                }
            }
            if (!pageItem || !pageItem.items) return;
            const node = pageItem.items.addNode("anonymous");
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
            logger.warn("addItemFromTopToolbar failed", e);
        }
    }

    function toggleSearchPanel() {
        isSearchPanelVisible = !isSearchPanelVisible;
    }

    function createDemoPage() {
        if (!store.project || !pageName) return;

        if (store.pageExists(pageName)) {
            const existingPage = findPage(pageName);
            if (existingPage) {
                store.currentPage = existingPage;
                pageNotFound = false;
                loadDemoPage(pageName);
                return;
            }
        }

        const created = store.project.addPage(pageName, "anonymous");
        if (created) {
            store.currentPage = created;
            pageNotFound = false;
            loadDemoPage(pageName);
        }
    }

    onMount(() => {
        // Follow route parameter changes (e.g. internal links between demo pages)
        let lastLoaded: string | undefined;
        const unsub = page.subscribe(($p) => {
            let name = $p.params?.page ?? "";
            if (!name) return;

            if (name === lastLoaded) return;
            lastLoaded = name;
            loadDemoPage(name);
        });
        return () => unsub();
    });

    // React to page list changes (e.g., demo reset recreating the page)
    $effect(() => {
        void store.pagesVersion;
        if (!isLoading && !error && store.currentPage && store.project) {
            const latestPage = findPage(pageName);
            // If the page was recreated (new instance with the same name), update currentPage
            if (latestPage && latestPage.key !== store.currentPage.key) {
                logger.info(`Page instance changed for "${pageName}", updating currentPage`);
                store.currentPage = latestPage;
            }
        }
    });

    onDestroy(() => {
        isDestroyed = true;
        try {
            yjsStore.yjsClient?.dispose();
            yjsStore.yjsClient = undefined;
            store.project = undefined;
            store.currentPage = undefined;
        } catch {}
    });
</script>

<svelte:head>
    <title>{pageName ? pageName : "Page"} - Demo | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: "Demo Project", href: "/demo" },
            { label: pageName }
        ]} />

        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">
                <span class="text-gray-600">Demo /</span>
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
                <button type="button"
                    onclick={addItemFromTopToolbar}
                    class="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300"
                >
                    Add Item
                </button>
            </div>
        </div>
        <p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo space. Content resets every 24 hours.
        </p>
    </div>

    {#if isLoading && !store.currentPage}
        <div class="flex flex-col items-center justify-center py-8 space-y-4" aria-busy="true" aria-live="polite" role="status">
            <div class="loader" aria-hidden="true"></div>
            <div class="text-gray-600 text-sm font-medium">Loading Demo...</div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4" role="alert" aria-live="assertive">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">An error occurred</h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button type="button"
                            onclick={() => loadDemoPage(pageName)}
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
                    <h3 class="text-sm font-medium text-yellow-800">Page not found</h3>
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
                projectName={DEMO_PROJECT_NAME}
                pageName={pageName}
                isReadOnly={false}
                onEdit={undefined}
            />

            <!-- Backlink Panel -->
            <BacklinkPanel {pageName} projectName={DEMO_PROJECT_NAME} />
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
