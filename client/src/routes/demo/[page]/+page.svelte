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
    import { store } from "../../../stores/store.svelte";
    import { yjsStore } from "../../../stores/yjsStore.svelte";
        import Breadcrumb from "../../../components/Breadcrumb.svelte";

    const logger = getLogger("DemoPageView");

    let pageName: string = $derived.by(() => $page.params.page ?? "");

    let isLoading = $state(true);
    let error: string | undefined = $state(undefined);
    let pageNotFound = $state(false);
    let isSearchPanelVisible = $state(false);
    let isDestroyed = false;

    function findPage(name: string): Item | undefined {
        const items = store.project?.items;
        if (!items) return undefined;
        // Use iterator for better performance ($O(N)$ vs $O(N^2 \log N)$)
        const iter = "iterateUnordered" in items && typeof items.iterateUnordered === "function"
            ? items.iterateUnordered()
            : items;
        for (const item of iter) {
            if (!item) continue;
            const text = item.text;
            if (String(text).toLowerCase() === String(name).toLowerCase()) {
                return item as Item;
            }
        }
        return undefined;
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
                yjsStore.yjsClient = client as unknown as import("../../../yjs/YjsClient").YjsClient;
                store.project = client.getProject() as unknown as import("../../../schema/app-schema").Project;
            }

            // Wait for sync until the page is found (5 seconds max)
            let targetPage = findPage(name);
            let retries = 0;
            while (!targetPage && retries < 50) {
                await new Promise(r => setTimeout(r, 100));
                if (isDestroyed) return;
                targetPage = findPage(name);
                retries++;
            }

            if (!targetPage) {
                logger.warn(`Demo page "${name}" not found after sync wait`);
                pageNotFound = true;
                return;
            }

            store.currentPage = targetPage;
        } catch (err) {
            logger.error(err, "Failed to load demo page");
            error = err instanceof Error ? err.message : "An error occurred while loading the demo page.";
        } finally {
            isLoading = false;
        }
    }

    function toggleSearchPanel() {
        isSearchPanelVisible = !isSearchPanelVisible;
    }

    onMount(() => {
        // Follow route parameter changes (e.g. internal links between demo pages)
        let lastLoaded: string | undefined;
        const unsub = page.subscribe(($p) => {
            const name = $p.params?.page ?? "";
            if (!name || name === lastLoaded) return;
            lastLoaded = name;
            loadDemoPage(name);
        });
        return () => unsub();
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

<main class="container mx-auto px-4 py-4">
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
                <button
                    onclick={toggleSearchPanel}
                    class="search-btn rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    data-testid="search-toggle-button"
                >
                    Search
                </button>
            </div>
        </div>
        <p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo space. Content resets every 24 hours.
        </p>
    </div>

    {#if isLoading}
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
                        <button
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
                </div>
            </div>
        </div>
    {:else if store.currentPage}
        <OutlinerBase
            pageItem={store.currentPage}
            projectName={DEMO_PROJECT_NAME}
            pageName={pageName}
            isReadOnly={false}
            isTemporary={false}
            onEdit={undefined}
        />

        <!-- Backlink Panel -->
        <BacklinkPanel {pageName} projectName={DEMO_PROJECT_NAME} />
    {/if}

    <!-- Search Panel -->
    <SearchPanel
        isVisible={isSearchPanelVisible}
        pageItem={store.currentPage}
        project={store.project}
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
